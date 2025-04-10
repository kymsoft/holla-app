"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { MessageCircle, Search, Settings, LogOut, Send, Users, Moon, Sun, PlusCircle } from "lucide-react"
import { useAuth } from "@/app/auth-provider"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast";
import { useSocket } from "@/hooks/use-socket"

type Message = {
  id: string
  content: string
  senderId: string
  senderName: string
  senderImage?: string
  timestamp: Date
}

type Conversation = {
  id: string
  name: string
  image?: string
  lastMessage?: string
  lastMessageTime?: Date
  unread: number
  online: boolean
  isGroup: boolean
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const { toast } = useToast()
  const { socket, isConnected } = useSocket()

  // Filter conversations based on search query
  const filteredConversations = conversations.filter((conversation) =>
    conversation.name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Fetch conversations
  useEffect(() => {
    const fetchConversations = async () => {
      if (!user) return

      try {
        const res = await fetch("/api/conversations")
        if (res.ok) {
          const data = await res.json()
          setConversations(data.conversations)
          setIsLoading(false)
        }
      } catch (error) {
        console.error("Error fetching conversations:", error)
        toast({
          title: "Error",
          description: "Failed to load conversations",
          variant: "destructive",
        })
        setIsLoading(false)
      }
    }

    fetchConversations()
  }, [user, toast])

  // Set first conversation as active by default
  useEffect(() => {
    if (filteredConversations.length > 0 && !activeConversation && !isLoading) {
      setActiveConversation(filteredConversations[0])
    }
  }, [filteredConversations, activeConversation, isLoading])

  // Fetch messages for active conversation
  useEffect(() => {
    const fetchMessages = async () => {
      if (!activeConversation) return

      try {
        const res = await fetch(`/api/messages?conversationId=${activeConversation.id}`)
        if (res.ok) {
          const data = await res.json()
          setMessages(data.messages)
        }
      } catch (error) {
        console.error("Error fetching messages:", error)
        toast({
          title: "Error",
          description: "Failed to load messages",
          variant: "destructive",
        })
      }
    }

    fetchMessages()

    // Join the conversation room via socket
    if (socket && activeConversation) {
      socket.emit("join-conversation", activeConversation.id)
    }

    return () => {
      // Leave the conversation room when changing conversations
      if (socket && activeConversation) {
        socket.emit("leave-conversation", activeConversation.id)
      }
    }
  }, [activeConversation, socket, toast])

  // Listen for new messages
  useEffect(() => {
    if (!socket) return

    const handleNewMessage = (message: Message) => {
      setMessages((prev) => [...prev, message])

      // Update conversation last message if it's the active conversation
      if (activeConversation && message.senderId !== user?.id) {
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id === activeConversation.id) {
              return {
                ...conv,
                lastMessage: message.content,
                lastMessageTime: message.timestamp,
                unread: message.senderId !== user?.id ? conv.unread + 1 : conv.unread,
              }
            }
            return conv
          }),
        )
      }
    }

    const handleUserStatusChange = ({ userId, isOnline }: { userId: string; isOnline: boolean }) => {
      // Update user online status in conversations
      setConversations((prev) =>
        prev.map((conv) => {
          // For non-group chats, check if this is the other user
          if (!conv.isGroup && conv.id.includes(userId)) {
            return { ...conv, online: isOnline }
          }
          return conv
        }),
      )
    }

    socket.on("new-message", handleNewMessage)
    socket.on("user-status-change", handleUserStatusChange)

    return () => {
      socket.off("new-message", handleNewMessage)
      socket.off("user-status-change", handleUserStatusChange)
    }
  }, [socket, activeConversation, user])

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // If user is not authenticated, redirect to login
  useEffect(() => {
    if (!user && !logout) {
      router.push("/login")
    }
  }, [user, router, logout])

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()

    if (!newMessage.trim() || !activeConversation || !socket || !user) return

    // Emit message to socket server
    socket.emit("send-message", {
      content: newMessage,
      conversationId: activeConversation.id,
      senderId: user.id,
      senderName: user.name,
    })

    // Optimistically add message to UI
    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      content: newMessage,
      senderId: user.id,
      senderName: user.name,
      timestamp: new Date(),
    }

    setMessages([...messages, optimisticMessage])
    setNewMessage("")
  }

  const handleCreateConversation = async () => {
    try {
      const res = await fetch("/api/users")
      if (res.ok) {
        const data = await res.json()
        // Show user selection UI here
        // For simplicity, we'll just create a conversation with the first user
        if (data.users.length > 0) {
          const otherUser = data.users[0]

          const createRes = await fetch("/api/conversations/create", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId: otherUser.id,
              isGroup: false,
            }),
          })

          if (createRes.ok) {
            const newConversation = await createRes.json()
            setConversations([...conversations, newConversation.conversation])
            setActiveConversation(newConversation.conversation)
            toast({
              title: "Conversation created",
              description: `Started a conversation with ${otherUser.name}`,
            })
          }
        }
      }
    } catch (error) {
      console.error("Error creating conversation:", error)
      toast({
        title: "Error",
        description: "Failed to create conversation",
        variant: "destructive",
      })
    }
  }

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    }).format(new Date(date))
  }

  const formatLastMessageTime = (date?: Date) => {
    if (!date) return ""

    const now = new Date()
    const messageDate = new Date(date)
    const diff = now.getTime() - messageDate.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days > 0) {
      return days === 1 ? "Yesterday" : `${days} days ago`
    }

    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours > 0) {
      return `${hours}h ago`
    }

    const minutes = Math.floor(diff / (1000 * 60))
    return minutes <= 0 ? "Just now" : `${minutes}m ago`
  }

  const handleLogout = async () => {
    try {
      await logout()
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      })
    } catch (error) {
      toast({
        title: "Logout failed",
        description: "There was a problem logging out.",
        variant: "destructive",
      })
    }
  }

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-950 to-slate-950">
        <p className="text-white">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-950 to-slate-950 dark:from-blue-950 dark:to-slate-950 light:from-blue-100 light:to-white">
      <header className="border-b border-blue-800/30 dark:border-blue-800/30 light:border-blue-200/50">
        <div className="container mx-auto py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-6 w-6 text-blue-400" />
              <h1 className="text-xl font-bold text-white dark:text-white light:text-blue-900">Holla</h1>
              {isConnected ? (
                <span className="text-xs text-green-400 bg-green-900/20 px-2 py-0.5 rounded-full">Connected</span>
              ) : (
                <span className="text-xs text-red-400 bg-red-900/20 px-2 py-0.5 rounded-full">Disconnected</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="text-blue-300 hover:text-blue-100 hover:bg-blue-900/50"
                onClick={toggleTheme}
              >
                {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                <span className="sr-only">Toggle theme</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-blue-300 hover:text-blue-100 hover:bg-blue-900/50"
                onClick={() => router.push("/settings")}
              >
                <Settings className="h-5 w-5" />
                <span className="sr-only">Settings</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-blue-300 hover:text-blue-100 hover:bg-blue-900/50"
                onClick={handleLogout}
              >
                <LogOut className="h-5 w-5" />
                <span className="sr-only">Logout</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden text-blue-300 hover:text-blue-100 hover:bg-blue-900/50"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                <Users className="h-5 w-5" />
                <span className="sr-only">Toggle contacts</span>
              </Button>
              <Avatar className="h-8 w-8 border border-blue-500/30">
                <AvatarImage src="/placeholder.svg?height=32&width=32" alt={user.name} />
                <AvatarFallback className="bg-blue-700 text-white">{user.name.charAt(0)}</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar - Conversations */}
        <aside
          className={cn(
            "w-80 border-r border-blue-800/30 dark:border-blue-800/30 light:border-blue-200/50 flex flex-col",
            "md:relative md:translate-x-0 transition-transform duration-200 ease-in-out",
            isMobileMenuOpen
              ? "absolute inset-y-0 left-0 translate-x-0 z-20 bg-slate-950/95 backdrop-blur-sm"
              : "-translate-x-full",
          )}
        >
          <div className="p-3 border-b border-blue-800/30 dark:border-blue-800/30 light:border-blue-200/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-blue-400" />
              <Input
                placeholder="Search conversations..."
                className="pl-9 bg-slate-800/50 border-blue-800/30 text-white"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-blue-300">Loading conversations...</div>
            ) : filteredConversations.length > 0 ? (
              filteredConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={cn(
                    "p-3 flex items-center gap-3 cursor-pointer hover:bg-blue-900/20",
                    activeConversation?.id === conversation.id && "bg-blue-900/30",
                  )}
                  onClick={() => {
                    setActiveConversation(conversation)
                    setIsMobileMenuOpen(false)
                  }}
                >
                  <div className="relative">
                    <Avatar className="h-12 w-12 border border-blue-500/30">
                      {conversation.image ? (
                        <AvatarImage src={conversation.image} alt={conversation.name} />
                      ) : (
                        <AvatarFallback className="bg-blue-700 text-white">
                          {conversation.name.charAt(0)}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    {conversation.online && (
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-slate-900"></span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <h3 className="font-medium text-white truncate">{conversation.name}</h3>
                      <span className="text-xs text-blue-400">
                        {formatLastMessageTime(conversation.lastMessageTime)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-blue-300 truncate">{conversation.lastMessage || "No messages yet"}</p>
                      {conversation.unread > 0 && (
                        <span className="bg-blue-600 text-white text-xs rounded-full h-5 min-w-5 flex items-center justify-center px-1">
                          {conversation.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-blue-300">No conversations found</div>
            )}
          </div>
          <div className="p-3 border-t border-blue-800/30">
            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={handleCreateConversation}>
              <PlusCircle className="h-4 w-4 mr-2" />
              New Conversation
            </Button>
          </div>
        </aside>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col">
          {activeConversation ? (
            <>
              {/* Chat header */}
              <div className="p-3 border-b border-blue-800/30 dark:border-blue-800/30 light:border-blue-200/50 flex items-center gap-3">
                <div className="relative">
                  <Avatar className="h-10 w-10 border border-blue-500/30">
                    {activeConversation.image ? (
                      <AvatarImage src={activeConversation.image} alt={activeConversation.name} />
                    ) : (
                      <AvatarFallback className="bg-blue-700 text-white">
                        {activeConversation.name.charAt(0)}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  {activeConversation.online && (
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-slate-900"></span>
                  )}
                </div>
                <div>
                  <h2 className="font-medium text-white">{activeConversation.name}</h2>
                  <p className="text-xs text-blue-400">{activeConversation.online ? "Online" : "Offline"}</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length > 0 ? (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn("flex", message.senderId === user.id ? "justify-end" : "justify-start")}
                    >
                      <div className="flex gap-2 max-w-[80%]">
                        {message.senderId !== user.id && (
                          <Avatar className="h-8 w-8 mt-1 border border-blue-500/30">
                            {message.senderImage ? (
                              <AvatarImage src={message.senderImage} alt={message.senderName} />
                            ) : (
                              <AvatarFallback className="bg-blue-700 text-white">
                                {message.senderName.charAt(0)}
                              </AvatarFallback>
                            )}
                          </Avatar>
                        )}
                        <div>
                          <div className="flex items-baseline gap-2">
                            {message.senderId !== user.id && (
                              <span className="text-sm font-medium text-blue-300">{message.senderName}</span>
                            )}
                            <span className="text-xs text-blue-400">{formatTime(message.timestamp)}</span>
                          </div>
                          <Card
                            className={cn(
                              "mt-1",
                              message.senderId === user.id
                                ? "bg-blue-600 border-blue-700 text-white"
                                : "bg-slate-800 border-blue-900/50 text-blue-100",
                            )}
                          >
                            <CardContent className="p-3 text-sm">{message.content}</CardContent>
                          </Card>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-blue-300">No messages yet. Start the conversation!</p>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message input */}
              <div className="p-3 border-t border-blue-800/30 dark:border-blue-800/30 light:border-blue-200/50">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    className="bg-slate-800/50 border-blue-800/30 text-white"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                  />
                  <Button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={!newMessage.trim() || !isConnected}
                  >
                    <Send className="h-4 w-4" />
                    <span className="sr-only">Send</span>
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageCircle className="h-12 w-12 text-blue-400 mx-auto mb-4" />
                <h2 className="text-xl font-medium text-white mb-2">No conversation selected</h2>
                <p className="text-blue-300">Select a conversation to start chatting</p>
                <Button className="mt-4 bg-blue-600 hover:bg-blue-700 text-white" onClick={handleCreateConversation}>
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Start a new conversation
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
