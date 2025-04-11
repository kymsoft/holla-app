import { io, type Socket } from "socket.io-client"
import { useToast } from "@/components/ui/use-toast";

// Singleton pattern for socket connection
let socket: Socket | null = null
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_INTERVAL = 2000 // 2 seconds

export const initializeSocket = async (userId: string): Promise<Socket> => {
  if (socket && socket.connected) {
    return socket
  }
  const { toast } = useToast()

  // Close any existing socket
  if (socket) {
    socket.close()
  }

  // Initialize the socket connection
  try {
    await fetch("/api/socket")
  } catch (error) {
    console.error("Error initializing socket endpoint:", error)
  }

  const socketUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"

  socket = io(socketUrl, {
    path: "/api/socket",
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    reconnectionDelay: RECONNECT_INTERVAL,
    timeout: 10000,
    transports: ["websocket", "polling"],
    forceNew: true,
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

  // Set up a ping interval to keep the connection alive
  const pingInterval = setInterval(() => {
    if (socket && socket.connected) {
      socket.emit("ping", () => {
        console.log("Ping successful")
      })
    }
  }, 30000) // Every 30 seconds

  // Clean up ping interval on unmount
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      clearInterval(pingInterval)
    })
  }

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
  onSuccess?: (localMessageId: string, messageId: string) => void,
): Promise<string> => {
  const localMessageId = `local-${Date.now()}`

  try {
    // First, save the message to the database via REST API
    const response = await fetch("/api/messages/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...message,
        localMessageId,
      }),
    })

    if (!response.ok) {
      throw new Error("Failed to save message")
    }

    const data = await response.json()
    const savedMessageId = data.message.id

    // Then, if socket is connected, emit the message for real-time delivery
    if (socket?.connected) {
      socket.emit("send-message", {
        ...message,
        localMessageId,
        messageId: savedMessageId,
      })
    }

    if (onSuccess) {
      onSuccess(localMessageId, savedMessageId)
    }

    return localMessageId
  } catch (error) {
    console.error("Error sending message:", error)

    // Store message in local queue if offline or error
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
export const sendOfflineMessages = async () => {
  const { toast } = useToast()
  if (!socket?.connected) return

  const offlineMessages = JSON.parse(localStorage.getItem("offlineMessages") || "[]")
  if (offlineMessages.length === 0) return

  console.log(`Sending ${offlineMessages.length} offline messages`)

  for (const message of offlineMessages) {
    try {
      // First save to database
      await fetch("/api/messages/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      })

      // Then emit for real-time delivery
      socket.emit("send-message", message)
    } catch (error) {
      console.error("Error sending offline message:", error)
    }
  }

  // Clear offline messages
  localStorage.setItem("offlineMessages", "[]")

  toast({
    title: "Messages Sent",
    description: `${offlineMessages.length} offline messages have been sent`,
  })
}
