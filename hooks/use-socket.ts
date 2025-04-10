"use client"

import { useEffect, useState } from "react"
import { io, type Socket } from "socket.io-client"
import { useAuth } from "@/app/auth-provider"

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    // Initialize socket connection
    const socketInit = async () => {
      await fetch("/api/socket")

      const socketInstance = io({
        path: "/api/socket",
      })

      socketInstance.on("connect", () => {
        console.log("Socket connected")
        setIsConnected(true)

        // Notify server that user is online
        if (user?.id) {
          socketInstance.emit("user-online", user.id)
        }
      })

      socketInstance.on("disconnect", () => {
        console.log("Socket disconnected")
        setIsConnected(false)
      })

      setSocket(socketInstance)
    }

    if (!socket && user) {
      socketInit()
    }

    return () => {
      if (socket) {
        socket.disconnect()
      }
    }
  }, [socket, user])

  return { socket, isConnected }
}
