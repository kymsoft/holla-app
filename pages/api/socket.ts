import type { Server as NetServer } from "http"
import type { NextApiRequest } from "next"
import { Server as ServerIO } from "socket.io"
import type { NextApiResponseServerIO } from "@/types/next"
import prisma from "@/lib/prisma"

export const config = {
  api: {
    bodyParser: false,
  },
}

const ioHandler = async (req: NextApiRequest, res: NextApiResponseServerIO) => {
  if (!res.socket.server.io) {
    const httpServer: NetServer = res.socket.server as any
    const io = new ServerIO(httpServer, {
      path: "/api/socket",
      addTrailingSlash: false,
      pingTimeout: 60000,
      pingInterval: 25000,
      cors: {
        origin: "*", // Allow all origins for development and testing
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket", "polling"], // Ensure both transport methods are available
    })

    // Store connected users
    const connectedUsers = new Map()

    // Socket.IO server
    io.on("connection", (socket) => {
      console.log(`Socket connected: ${socket.id}`)

      // User joins a conversation
      socket.on("join-conversation", (conversationId: string) => {
        socket.join(conversationId)
        console.log(`User joined conversation: ${conversationId}`)
      })

      // User leaves a conversation
      socket.on("leave-conversation", (conversationId: string) => {
        socket.leave(conversationId)
        console.log(`User left conversation: ${conversationId}`)
      })

      // User sends a message
      socket.on("send-message", async (data) => {
        try {
          const { content, conversationId, senderId, senderName, localMessageId } = data

          console.log(`Message received from ${senderId} to conversation ${conversationId}`)

          // Save message to database
          const message = await prisma.message.create({
            data: {
              content,
              conversationId,
              senderId,
            },
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
          })

          // Update conversation's last activity
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
          })

          // Get all participants in this conversation
          const participants = await prisma.participant.findMany({
            where: { conversationId },
            select: { userId: true },
          })

          // Create message status entries for all participants
          await Promise.all(
            participants.map(async (participant) => {
              const isSender = participant.userId === senderId
              const isOnline = connectedUsers.has(participant.userId)

              await prisma.messageStatus.create({
                data: {
                  messageId: message.id,
                  userId: participant.userId,
                  status: isSender ? "sent" : isOnline ? "delivered" : "sent",
                  deliveredAt: isOnline && !isSender ? new Date() : null,
                },
              })
            }),
          )

          // Broadcast message to all users in the conversation
          io.to(conversationId).emit("new-message", {
            id: message.id,
            localMessageId,
            content: message.content,
            senderId: message.senderId,
            senderName: message.sender.name,
            senderImage: message.sender.image,
            timestamp: message.createdAt,
            status: "sent",
            isOwnMessage: false,
          })

          // Acknowledge message receipt to sender
          socket.emit("message-sent", {
            localMessageId,
            messageId: message.id,
          })

          console.log(`Message broadcast to conversation ${conversationId}`)
        } catch (error) {
          console.error("Error sending message:", error)
          socket.emit("message-error", { error: "Failed to send message", localMessageId: data.localMessageId })
        }
      })

      // User comes online
      socket.on("user-online", async (userId: string) => {
        try {
          console.log(`User ${userId} is now online with socket ${socket.id}`)

          // Store socket ID with user
          await prisma.user.update({
            where: { id: userId },
            data: { socketId: socket.id, isOnline: true },
          })

          // Store user ID with socket for quick lookup
          socket.data.userId = userId
          connectedUsers.set(userId, socket.id)

          // Broadcast user online status to all clients
          socket.broadcast.emit("user-status-change", { userId, isOnline: true })

          // Find undelivered messages for this user
          const undeliveredMessages = await prisma.messageStatus.findMany({
            where: {
              userId,
              status: "sent",
              message: {
                senderId: {
                  not: userId, // Don't include messages sent by this user
                },
              },
            },
            include: {
              message: {
                include: {
                  sender: {
                    select: {
                      id: true,
                      name: true,
                      image: true,
                    },
                  },
                },
              },
            },
          })

          // Update status to delivered
          if (undeliveredMessages.length > 0) {
            await prisma.messageStatus.updateMany({
              where: {
                id: { in: undeliveredMessages.map((m) => m.id) },
              },
              data: {
                status: "delivered",
                deliveredAt: new Date(),
              },
            })

            // Group messages by conversation
            const messagesByConversation = undeliveredMessages.reduce(
              (acc, status) => {
                const conversationId = status.message.conversationId
                if (!acc[conversationId]) {
                  acc[conversationId] = []
                }

                acc[conversationId].push({
                  id: status.message.id,
                  content: status.message.content,
                  senderId: status.message.senderId,
                  senderName: status.message.sender.name,
                  senderImage: status.message.sender.image,
                  timestamp: status.message.createdAt,
                  status: "delivered",
                  isOwnMessage: false,
                })

                return acc
              },
              {} as Record<string, any[]>,
            )

            // Send undelivered messages for each conversation
            Object.entries(messagesByConversation).forEach(([conversationId, messages]) => {
              socket.emit("undelivered-messages", {
                conversationId,
                messages,
              })
              console.log(
                `Sent ${messages.length} undelivered messages for conversation ${conversationId} to user ${userId}`,
              )
            })

            // Notify senders that their messages were delivered
            const senderIds = [...new Set(undeliveredMessages.map((status) => status.message.senderId))]

            senderIds.forEach((senderId) => {
              const messageIds = undeliveredMessages
                .filter((status) => status.message.senderId === senderId)
                .map((status) => status.message.id)

              const senderSocketId = connectedUsers.get(senderId)
              if (senderSocketId) {
                io.to(senderSocketId).emit("messages-delivered", {
                  messageIds,
                  deliveredTo: userId,
                })
                console.log(`Notified sender ${senderId} that messages were delivered to ${userId}`)
              }
            })
          }
        } catch (error) {
          console.error("Error updating user online status:", error)
        }
      })

      // Handle message read status
      socket.on("mark-messages-read", async (data) => {
        try {
          const { conversationId, userId } = data

          console.log(`Marking messages as read in conversation ${conversationId} for user ${userId}`)

          // Find unread messages in this conversation for this user
          const unreadMessages = await prisma.messageStatus.findMany({
            where: {
              userId,
              status: { in: ["sent", "delivered"] },
              message: {
                conversationId,
                senderId: { not: userId }, // Only mark others' messages as read
              },
            },
            include: {
              message: {
                select: {
                  id: true,
                  senderId: true,
                },
              },
            },
          })

          // Update to read status
          if (unreadMessages.length > 0) {
            await prisma.messageStatus.updateMany({
              where: {
                id: { in: unreadMessages.map((m) => m.id) },
              },
              data: {
                status: "read",
                readAt: new Date(),
              },
            })

            // Group by sender
            const messagesBySender = unreadMessages.reduce(
              (acc, status) => {
                const senderId = status.message.senderId
                if (!acc[senderId]) {
                  acc[senderId] = []
                }
                acc[senderId].push(status.message.id)
                return acc
              },
              {} as Record<string, string[]>,
            )

            // Notify each sender
            Object.entries(messagesBySender).forEach(([senderId, messageIds]) => {
              const senderSocketId = connectedUsers.get(senderId)

              if (senderSocketId) {
                io.to(senderSocketId).emit("messages-read", {
                  messageIds,
                  readBy: userId,
                  conversationId,
                })
                console.log(`Notified sender ${senderId} that messages were read by ${userId}`)
              }
            })
          }
        } catch (error) {
          console.error("Error marking messages as read:", error)
        }
      })

      // Handle disconnection
      socket.on("disconnect", async () => {
        try {
          const userId = socket.data.userId

          if (userId) {
            console.log(`User ${userId} disconnected`)

            // Update user status to offline
            await prisma.user.update({
              where: { id: userId },
              data: { isOnline: false, lastSeen: new Date(), socketId: null },
            })

            // Remove from connected users map
            connectedUsers.delete(userId)

            // Broadcast user offline status
            socket.broadcast.emit("user-status-change", { userId, isOnline: false })
          }
        } catch (error) {
          console.error("Error handling disconnect:", error)
        }
      })

      // Ping to keep connection alive
      socket.on("ping", (callback) => {
        if (typeof callback === "function") {
          callback()
        }
      })
    })

    res.socket.server.io = io
  }

  res.end()
}

export default ioHandler
