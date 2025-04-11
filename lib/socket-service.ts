import { io, type Socket } from "socket.io-client"
import { useToast } from "@/components/ui/use-toast";

// Singleton pattern for socket connection
let socket: Socket | null = null
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_INTERVAL = 3000 // 3 seconds

export const initializeSocket = async (userId: string): Promise<Socket> => {
  if (socket && socket.connected) {
    return socket
  }
  const { toast } = useToast()

  // Initialize the socket connection
  await fetch("/api/socket")

  socket = io({
    path: "/api/socket",
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    reconnectionDelay: RECONNECT_INTERVAL,
    timeout: 10000,
  })

  socket.on("connect", () => {
    console.log("Socket connected with ID:", socket?.id)
    reconnectAttempts = 0

    // Identify the user to the server
    socket?.emit("user-online", userId)

    // Show connection status
    toast({
      title: "Connected",
      description: "You are now connected to the chat server",
    })
  })

  socket.on("connect_error", (err) => {
    console.error("Connection error:", err)
    handleReconnection()
  })

  socket.on("disconnect", (reason) => {
    console.log("Socket disconnected:", reason)

    if (reason === "io server disconnect") {
      // The server has forcefully disconnected the socket
      handleReconnection()
    }

    toast({
      title: "Disconnected",
      description: "You are currently offline. Messages will be sent when you reconnect.",
      variant: "destructive",
    })
  })

  socket.on("reconnect_failed", () => {
    console.log("Failed to reconnect after multiple attempts")
    toast({
      title: "Connection Failed",
      description: "Unable to connect to the chat server. Please refresh the page.",
      variant: "destructive",
    })
  })

  return socket
}

const handleReconnection = () => {
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && socket) {
    reconnectAttempts++
    setTimeout(() => {
      console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`)
      socket?.connect()
    }, RECONNECT_INTERVAL)
  }
}

export const getSocket = (): Socket | null => {
  return socket
}

export const disconnectSocket = (): void => {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export const sendMessage = async (
  message: {
    content: string
    conversationId: string
    senderId: string
    senderName: string
  },
  onSuccess?: (localMessageId: string) => void,
): Promise<string> => {
  const localMessageId = `local-${Date.now()}`

  // Store message in local queue if offline
  if (!socket?.connected) {
    storeOfflineMessage(message, localMessageId)
    return localMessageId
  }

  try {
    // Send message through socket
    socket.emit("send-message", {
      ...message,
      localMessageId,
    })

    if (onSuccess) {
      onSuccess(localMessageId)
    }

    return localMessageId
  } catch (error) {
    console.error("Error sending message:", error)
    storeOfflineMessage(message, localMessageId)
    return localMessageId
  }
}

// Store messages locally when offline
const storeOfflineMessage = (message: any, localMessageId: string) => {
  const offlineMessages = JSON.parse(localStorage.getItem("offlineMessages") || "[]")
  offlineMessages.push({
    ...message,
    localMessageId,
    timestamp: new Date().toISOString(),
  })
  localStorage.setItem("offlineMessages", JSON.stringify(offlineMessages))
}

// Send stored offline messages when back online
export const sendOfflineMessages = () => {
  const { toast } = useToast()
  if (!socket?.connected) return

  const offlineMessages = JSON.parse(localStorage.getItem("offlineMessages") || "[]")
  if (offlineMessages.length === 0) return

  console.log(`Sending ${offlineMessages.length} offline messages`)

  offlineMessages.forEach((message: any) => {
    socket?.emit("send-message", message)
  })

  // Clear offline messages
  localStorage.setItem("offlineMessages", "[]")

  toast({
    title: "Messages Sent",
    description: `${offlineMessages.length} offline messages have been sent`,
  })
}
