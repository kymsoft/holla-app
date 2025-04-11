"use client"

import { useEffect, useState, useCallback } from "react"
import type { Socket } from "socket.io-client"
import { useAuth } from "@/app/auth-provider"
import { initializeSocket, disconnectSocket, getSocket, sendOfflineMessages } from "@/lib/socket-service"

export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(false)
  const { user } = useAuth()

  const setupSocket = useCallback(async () => {
    if (!user?.id) return null

    let socket: Socket | null = null

    try {
      socket = await initializeSocket(user.id)

      const handleConnect = () => {
        console.log("Socket connected in hook")
        setIsConnected(true)
        sendOfflineMessages()
      }

      const handleDisconnect = () => {
        console.log("Socket disconnected in hook")
        setIsConnected(false)
      }

      socket.on("connect", handleConnect)
      socket.on("disconnect", handleDisconnect)

      // Set initial connection state
      setIsConnected(socket.connected)

      return socket
    } catch (error) {
      console.error("Error setting up socket:", error)
      return null
    }
  }, [user?.id])

  useEffect(() => {
    let socket: Socket | null = null

    const initSocket = async () => {
      socket = await setupSocket()
    }

    initSocket()

    return () => {
      if (socket) {
        socket.off("connect")
        socket.off("disconnect")
      }
    }
  }, [setupSocket])

  // Force reconnect function
  const reconnect = useCallback(async () => {
    disconnectSocket()
    await setupSocket()
  }, [setupSocket])

  return {
    socket: getSocket(),
    isConnected,
    reconnect,
  }
}
