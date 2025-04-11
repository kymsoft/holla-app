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
      pingTimeout: 60000, // Increase ping timeout to 60 seconds
      pingInterval: 25000, // Ping every 25 seconds
      cors: {
        origin: "*", // Allow all origins in development
        methods: ["GET", "POST"],
      },
    })

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

          // Check which participants are online
          const onlineParticipants = await prisma.user.findMany({
            where: {
              id: { in: participants.map((p) => p.userId) },
              isOnline: true,
            },
            select: { id: true },
          })

          // Create message status entries for all participants
          await Promise.all(
            participants.map(async (participant) => {
              const isOnline = onlineParticipants.some((op) => op.id === participant.userId)
              const isSender = participant.userId === senderId

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
          })

          // Acknowledge message receipt to sender
          socket.emit("message-sent", {
            localMessageId,
            messageId: message.id,
          })
        } catch (error) {
          console.error("Error sending message:", error)
          socket.emit("message-error", { error: "Failed to send message" })
        }
      })

      // User comes online
      socket.on("user-online", async (userId: string) => {
        try {
          // Store socket ID with user
          await prisma.user.update({
            where: { id: userId },
            data: { socketId: socket.id, isOnline: true },
          })

          // Broadcast user online status
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
                  conversation: true,
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
            const messagesByConversation: Record<string, any[]> = {}

            undeliveredMessages.forEach((status) => {
              const conversationId = status.message.conversationId
              if (!messagesByConversation[conversationId]) {
                messagesByConversation[conversationId] = []
              }

              messagesByConversation[conversationId].push({
                id: status.message.id,
                content: status.message.content,
                senderId: status.message.senderId,
                senderName: status.message.sender.name,
                senderImage: status.message.sender.image,
                timestamp: status.message.createdAt,
                status: "delivered",
              })
            })

            // Send undelivered messages for each conversation
            Object.entries(messagesByConversation).forEach(([conversationId, messages]) => {
              socket.emit("undelivered-messages", {
                conversationId,
                messages,
              })
            })

            // Notify senders that their messages were delivered
            const senderIds = [...new Set(undeliveredMessages.map((status) => status.message.senderId))]

            senderIds.forEach((senderId) => {
              const messageIds = undeliveredMessages
                .filter((status) => status.message.senderId === senderId)
                .map((status) => status.message.id)

              const senderSocket = io.sockets.sockets.get(
                Array.from(io.sockets.sockets.values()).find((s) => s.data && s.data.userId === senderId)?.id || "",
              )

              if (senderSocket) {
                senderSocket.emit("messages-delivered", {
                  messageIds,
                  deliveredTo: userId,
                })
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
            const messagesBySender: Record<string, string[]> = {}
            unreadMessages.forEach((status) => {
              const senderId = status.message.senderId
              if (!messagesBySender[senderId]) {
                messagesBySender[senderId] = []
              }
              messagesBySender[senderId].push(status.message.id)
            })

            // Notify each sender
            Object.entries(messagesBySender).forEach(([senderId, messageIds]) => {
              const senderSocket = Array.from(io.sockets.sockets.values()).find(
                (s) => s.data && s.data.userId === senderId,
              )

              if (senderSocket) {
                senderSocket.emit("messages-read", {
                  messageIds,
                  readBy: userId,
                  conversationId,
                })
              }
            })
          }
        } catch (error) {
          console.error("Error marking messages as read:", error)
        }
      })

      // Store user ID with socket for later reference
      socket.data = { userId: null }

      // Handle disconnection
      socket.on("disconnect", async () => {
        try {
          // Find user with this socket ID
          const user = await prisma.user.findFirst({
            where: { socketId: socket.id },
          })

          if (user) {
            // Update user status to offline
            await prisma.user.update({
              where: { id: user.id },
              data: { isOnline: false, lastSeen: new Date(), socketId: null },
            })

            // Broadcast user offline status
            socket.broadcast.emit("user-status-change", { userId: user.id, isOnline: false })
          }
        } catch (error) {
          console.error("Error handling disconnect:", error)
        }
      })
    })

    res.socket.server.io = io
  }

  res.end()
}

export default ioHandler
