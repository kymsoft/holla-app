"use client"

import { useState, useEffect, useRef } from "react"
import { Search, X, UserPlus, Check } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"

type User = {
  id: string
  name: string
  email: string
  image?: string
  isOnline: boolean
  lastSeen?: Date
}

export function UserSearch() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<User[]>([])
  const [isCreatingConversation, setIsCreatingConversation] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const router = useRouter()

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  // Search users when query changes
  useEffect(() => {
    const searchUsers = async () => {
      if (!query.trim()) {
        setResults([])
        return
      }

      setIsLoading(true)
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`)
        if (res.ok) {
          const data = await res.json()
          setResults(data.users)
        }
      } catch (error) {
        console.error("Error searching users:", error)
      } finally {
        setIsLoading(false)
      }
    }

    const debounce = setTimeout(searchUsers, 300)
    return () => clearTimeout(debounce)
  }, [query])

  const handleSelectUser = (user: User) => {
    // For single user selection
    if (selectedUsers.length === 0) {
      createConversation(user.id, false)
      return
    }

    // For multi-user selection (group chat)
    if (!selectedUsers.some((selected) => selected.id === user.id)) {
      setSelectedUsers([...selectedUsers, user])
    }
  }

  const handleRemoveUser = (userId: string) => {
    setSelectedUsers(selectedUsers.filter((user) => user.id !== userId))
  }

  const createConversation = async (userId: string, isGroup: boolean, name?: string) => {
    setIsCreatingConversation(true)
    try {
      const payload = isGroup
        ? {
            isGroup: true,
            name: name || `Group (${selectedUsers.length + 1})`,
            userIds: [...selectedUsers.map((user) => user.id), userId],
          }
        : {
            userId,
            isGroup: false,
          }

      const res = await fetch("/api/conversations/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        const data = await res.json()
        toast({
          title: isGroup ? "Group created" : "Conversation started",
          description: isGroup
            ? `Created group with ${selectedUsers.length + 1} people`
            : `Started conversation with ${results.find((user) => user.id === userId)?.name}`,
        })

        // Reset state
        setQuery("")
        setResults([])
        setSelectedUsers([])
        setIsOpen(false)

        // Navigate to the conversation
        router.push(`/chat?conversationId=${data.conversation.id}`)
      } else {
        throw new Error("Failed to create conversation")
      }
    } catch (error) {
      console.error("Error creating conversation:", error)
      toast({
        title: "Error",
        description: "Failed to create conversation",
        variant: "destructive",
      })
    } finally {
      setIsCreatingConversation(false)
    }
  }

  const handleCreateGroupChat = () => {
    if (selectedUsers.length < 2) {
      toast({
        title: "Not enough users",
        description: "Please select at least 2 users to create a group",
        variant: "destructive",
      })
      return
    }

    createConversation(selectedUsers[0].id, true)
  }

  const formatLastSeen = (date?: Date) => {
    if (!date) return "Never online"
    return formatDistanceToNow(new Date(date), { addSuffix: true })
  }

  return (
    <div className="relative" ref={searchRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-blue-400" />
        <Input
          placeholder="Search users..."
          className="pl-9 bg-slate-800/50 border-blue-800/30 text-white pr-8"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 text-blue-400"
            onClick={() => {
              setQuery("")
              setResults([])
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Selected users (for group chat) */}
      {selectedUsers.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {selectedUsers.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-1 bg-blue-900/30 text-blue-100 rounded-full pl-1 pr-2 py-1"
            >
              <Avatar className="h-5 w-5">
                {user.image ? (
                  <AvatarImage src={user.image} alt={user.name} />
                ) : (
                  <AvatarFallback className="bg-blue-700 text-white text-xs">{user.name[0]}</AvatarFallback>
                )}
              </Avatar>
              <span className="text-xs">{user.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 text-blue-300 hover:text-blue-100 hover:bg-blue-800/50 rounded-full"
                onClick={() => handleRemoveUser(user.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}

          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 border-blue-500 text-blue-400 hover:bg-blue-900/20"
            onClick={handleCreateGroupChat}
            disabled={isCreatingConversation}
          >
            Create Group
          </Button>
        </div>
      )}

      {/* Search results dropdown */}
      {isOpen && (query || results.length > 0) && (
        <div className="absolute z-10 mt-1 w-full bg-slate-900 border border-blue-800/30 rounded-md shadow-lg max-h-60 overflow-auto">
          {isLoading ? (
            <div className="p-2 text-center text-blue-300">Searching...</div>
          ) : results.length > 0 ? (
            <ul>
              {results.map((user) => (
                <li
                  key={user.id}
                  className="hover:bg-blue-900/30 cursor-pointer"
                  onClick={() => handleSelectUser(user)}
                >
                  <div className="flex items-center justify-between p-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        {user.image ? (
                          <AvatarImage src={user.image} alt={user.name} />
                        ) : (
                          <AvatarFallback className="bg-blue-700 text-white">{user.name[0]}</AvatarFallback>
                        )}
                      </Avatar>
                      <div>
                        <div className="font-medium text-white">{user.name}</div>
                        <div className="text-xs text-blue-300">{user.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-blue-400">
                        {user.isOnline ? <span className="text-green-400">Online</span> : formatLastSeen(user.lastSeen)}
                      </div>
                      {selectedUsers.some((selected) => selected.id === user.id) ? (
                        <Check className="h-4 w-4 text-green-400" />
                      ) : (
                        <UserPlus className="h-4 w-4 text-blue-400" />
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : query ? (
            <div className="p-2 text-center text-blue-300">No users found</div>
          ) : null}
        </div>
      )}
    </div>
  )
}
