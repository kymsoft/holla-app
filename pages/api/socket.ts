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
      pingTimeout: 30000,
      pingInterval: 10000,
      cors: {
        origin: process.env.NODE_ENV === "production"
          ? ["https://holla-app.vercel.app"] // Replace with your actual domain(s)
          : "*",
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket"], // Prefer WebSocket only in production
    })

    const connectedUsers = new Map()

    io.on("connection", (socket) => {
      // Optional: log connection only in development
      if (process.env.NODE_ENV !== "production") {
        console.log(`Socket connected: ${socket.id}`)
      }

      socket.on("join-conversation", (conversationId: string) => {
        socket.join(conversationId)
      })

      socket.on("leave-conversation", (conversationId: string) => {
        socket.leave(conversationId)
      })

      socket.on("send-message", async (data) => {
        try {
          const { content, conversationId, senderId, senderName, localMessageId, messageId } = data

          if (messageId) {
            const message = await prisma.message.findUnique({
              where: { id: messageId },
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

            if (!message) throw new Error("Message not found")

            socket.to(conversationId).emit("new-message", {
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

            socket.emit("message-sent", {
              localMessageId,
              messageId: message.id,
            })

            return
          }

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

          await prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
          })

          const participants = await prisma.participant.findMany({
            where: { conversationId },
            select: { userId: true },
          })

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

          socket.emit("message-sent", {
            localMessageId,
            messageId: message.id,
          })

        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            console.error("Error sending message:", error)
          }
          socket.emit("message-error", { error: "Failed to send message", localMessageId: data.localMessageId })
        }
      })

      socket.on("user-online", async (userId: string) => {
        try {
          await prisma.user.update({
            where: { id: userId },
            data: { socketId: socket.id, isOnline: true },
          })

          socket.data.userId = userId
          connectedUsers.set(userId, socket.id)

          socket.broadcast.emit("user-status-change", { userId, isOnline: true })

          const undeliveredMessages = await prisma.messageStatus.findMany({
            where: {
              userId,
              status: "sent",
              message: {
                senderId: { not: userId },
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

            const messagesByConversation = undeliveredMessages.reduce((acc, status) => {
              const cid = status.message.conversationId
              if (!acc[cid]) acc[cid] = []
              acc[cid].push({
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
            }, {} as Record<string, any[]>)

            Object.entries(messagesByConversation).forEach(([conversationId, messages]) => {
              socket.emit("undelivered-messages", {
                conversationId,
                messages,
              })
            })

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
              }
            })
          }
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            console.error("Error updating user online status:", error)
          }
        }
      })

      socket.on("mark-messages-read", async ({ conversationId, userId }) => {
        try {
          const unreadMessages = await prisma.messageStatus.findMany({
            where: {
              userId,
              status: { in: ["sent", "delivered"] },
              message: {
                conversationId,
                senderId: { not: userId },
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

            const messagesBySender = unreadMessages.reduce((acc, status) => {
              const sid = status.message.senderId
              if (!acc[sid]) acc[sid] = []
              acc[sid].push(status.message.id)
              return acc
            }, {} as Record<string, string[]>)

            Object.entries(messagesBySender).forEach(([senderId, messageIds]) => {
              const senderSocketId = connectedUsers.get(senderId)
              if (senderSocketId) {
                io.to(senderSocketId).emit("messages-read", {
                  messageIds,
                  readBy: userId,
                  conversationId,
                })
              }
            })
          }
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            console.error("Error marking messages as read:", error)
          }
        }
      })

      socket.on("disconnect", async () => {
        const userId = socket.data.userId
        if (userId) {
          try {
            await prisma.user.update({
              where: { id: userId },
              data: { isOnline: false, lastSeen: new Date(), socketId: null },
            })

            connectedUsers.delete(userId)
            socket.broadcast.emit("user-status-change", { userId, isOnline: false })
          } catch (error) {
            if (process.env.NODE_ENV !== "production") {
              console.error("Error on disconnect:", error)
            }
          }
        }
      })

      socket.on("ping", (cb) => typeof cb === "function" && cb())
    })

    res.socket.server.io = io
  }

  res.end()
}

export default ioHandler
