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
        origin: process.env.NEXT_PUBLIC_APP_URL || "*",
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

          // Mark message as delivered for online users
          if (onlineParticipants.length > 0) {
            await prisma.messageDelivery.createMany({
              data: onlineParticipants.map((user) => ({
                messageId: message.id,
                userId: user.id,
                status: user.id === senderId ? "sent" : "delivered",
              })),
              skipDuplicates: true,
            })
          }

          // For offline users, create pending deliveries
          const offlineParticipantIds = participants
            .map((p) => p.userId)
            .filter((id) => !onlineParticipants.some((op) => op.id === id) && id !== senderId)

          if (offlineParticipantIds.length > 0) {
            await prisma.messageDelivery.createMany({
              data: offlineParticipantIds.map((userId) => ({
                messageId: message.id,
                userId,
                status: "pending",
              })),
              skipDuplicates: true,
            })
          }

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

          // Deliver pending messages to this user
          const pendingDeliveries = await prisma.messageDelivery.findMany({
            where: {
              userId,
              status: "pending",
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

          // Update delivery status to delivered
          if (pendingDeliveries.length > 0) {
            await prisma.messageDelivery.updateMany({
              where: {
                id: { in: pendingDeliveries.map((d) => d.id) },
              },
              data: {
                status: "delivered",
                deliveredAt: new Date(),
              },
            })

            // Send pending messages to the user
            const messagesByConversation: Record<string, any[]> = {}

            pendingDeliveries.forEach((delivery) => {
              const conversationId = delivery.message.conversationId
              if (!messagesByConversation[conversationId]) {
                messagesByConversation[conversationId] = []
              }

              messagesByConversation[conversationId].push({
                id: delivery.message.id,
                content: delivery.message.content,
                senderId: delivery.message.senderId,
                senderName: delivery.message.sender.name,
                senderImage: delivery.message.sender.image,
                timestamp: delivery.message.createdAt,
                status: "delivered",
              })
            })

            // Send pending messages for each conversation
            Object.entries(messagesByConversation).forEach(([conversationId, messages]) => {
              socket.emit("pending-messages", {
                conversationId,
                messages,
              })
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
          const unreadDeliveries = await prisma.messageDelivery.findMany({
            where: {
              userId,
              status: { in: ["delivered", "pending"] },
              message: {
                conversationId,
              },
            },
          })

          // Update to read status
          if (unreadDeliveries.length > 0) {
            await prisma.messageDelivery.updateMany({
              where: {
                id: { in: unreadDeliveries.map((d) => d.id) },
              },
              data: {
                status: "read",
                readAt: new Date(),
              },
            })

            // Notify senders that their messages were read
            const messageIds = unreadDeliveries.map((d) => d.messageId)

            const messages = await prisma.message.findMany({
              where: {
                id: { in: messageIds },
              },
              select: {
                id: true,
                senderId: true,
              },
            })

            // Group by sender
            const messagesBySender: Record<string, string[]> = {}
            messages.forEach((msg) => {
              if (!messagesBySender[msg.senderId]) {
                messagesBySender[msg.senderId] = []
              }
              messagesBySender[msg.senderId].push(msg.id)
            })

            // Notify each sender
            Object.entries(messagesBySender).forEach(([senderId, msgIds]) => {
              io.to(senderId).emit("messages-read", {
                messageIds: msgIds,
                readBy: userId,
                conversationId,
              })
            })
          }
        } catch (error) {
          console.error("Error marking messages as read:", error)
        }
      })

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
