import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import prisma from "@/lib/prisma"

export async function GET() {
  try {
    const sessionId = (await cookies()).get("session_id")?.value

    if (!sessionId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    // Find session and user
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    })

    if (!session || session.expires < new Date()) {
      (await cookies()).delete("session_id")
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const currentUserId = session.user.id

    // Get user's conversations
    const conversations = await prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            userId: currentUserId,
          },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
                isOnline: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    })

    // Get unread message counts for each conversation
    const unreadCounts = await Promise.all(
      conversations.map(async (conversation) => {
        const count = await prisma.messageStatus.count({
          where: {
            userId: currentUserId,
            status: { in: ["sent", "delivered"] },
            message: {
              conversationId: conversation.id,
              senderId: { not: currentUserId },
            },
          },
        })
        return { conversationId: conversation.id, count }
      }),
    )

    // Format conversations
    const formattedConversations = conversations.map((conversation) => {
      const otherParticipants = conversation.participants.filter((participant) => participant.userId !== currentUserId)

      const isGroup = conversation.isGroup

      const lastMessage = conversation.messages[0]
      const unreadCount = unreadCounts.find((uc) => uc.conversationId === conversation.id)?.count || 0

      // For group chats, use the group name
      // For one-on-one chats, use the other person's name
      const name = isGroup ? conversation.name || "Group Chat" : otherParticipants[0]?.user.name || "Unknown User"

      // For group chats, we don't have a single image
      // For one-on-one chats, use the other person's image
      const image = isGroup ? null : otherParticipants[0]?.user.image

      // For group chats, if any participant is online
      // For one-on-one chats, if the other person is online
      const online = isGroup
        ? otherParticipants.some((p) => p.user.isOnline)
        : otherParticipants[0]?.user.isOnline || false

      return {
        id: conversation.id,
        name,
        image,
        isGroup,
        lastMessage: lastMessage
          ? {
              content: lastMessage.content,
              sender: lastMessage.sender.name,
              timestamp: lastMessage.createdAt,
              isOwnMessage: lastMessage.senderId === currentUserId,
            }
          : null,
        unread: unreadCount,
        online,
        updatedAt: conversation.updatedAt,
      }
    })

    return NextResponse.json({ conversations: formattedConversations })
  } catch (error) {
    console.error("Get conversations error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}
