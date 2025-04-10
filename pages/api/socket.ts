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
          const { content, conversationId, senderId, senderName } = data

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

          // Broadcast message to all users in the conversation
          io.to(conversationId).emit("new-message", {
            id: message.id,
            content: message.content,
            senderId: message.senderId,
            senderName: message.sender.name,
            senderImage: message.sender.image,
            timestamp: message.createdAt,
          })
        } catch (error) {
          console.error("Error sending message:", error)
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
        } catch (error) {
          console.error("Error updating user online status:", error)
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
