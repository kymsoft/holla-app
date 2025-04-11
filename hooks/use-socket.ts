"use client"

import { useEffect, useState } from "react"
import type { Socket } from "socket.io-client"
import { useAuth } from "@/app/auth-provider"
import { initializeSocket, disconnectSocket, getSocket, sendOfflineMessages } from "@/lib/socket-service"

export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    if (!user?.id) return

    let socket: Socket | null = null

    const setupSocket = async () => {
      socket = await initializeSocket(user.id)

      const handleConnect = () => {
        setIsConnected(true)
        sendOfflineMessages()
      }

      const handleDisconnect = () => {
        setIsConnected(false)
      }

      socket.on("connect", handleConnect)
      socket.on("disconnect", handleDisconnect)

      // Set initial connection state
      setIsConnected(socket.connected)
    }

    setupSocket()

    return () => {
      if (socket) {
        socket.off("connect")
        socket.off("disconnect")
      }
      disconnectSocket()
    }
  }, [user?.id])

  return { socket: getSocket(), isConnected }
}
