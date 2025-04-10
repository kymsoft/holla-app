import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function GET() {
  try {
    const sessionCookies = await cookies()
    const sessionId = sessionCookies.get("session_id")?.value

    if (!sessionId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    // Find session and user
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    })

    if (!session || session.expires < new Date()) {
      const sessionCookies = await cookies()
      sessionCookies.delete("session_id")
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    // Get user's conversations
    const conversations = await prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            userId: session.user.id,
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

    // Format conversations
    interface FormattedConversation {
      id: string
      name: string
      image: string | null
      isGroup: boolean
      lastMessage: LastMessage | null
    }

    interface LastMessage {
      content: string
      sender: string
      timestamp: Date
    }

    const formattedConversations: FormattedConversation[] = conversations.map((conversation: { id: string; name: string | null; participants: any[]; messages: any[]; updatedAt: Date }) => {
      const otherParticipants = conversation.participants.filter(
        (participant) => participant.userId !== session.user.id,
      )

      const isGroup = otherParticipants.length > 1

      const lastMessage = conversation.messages[0]

      return {
        id: conversation.id,
        name: isGroup ? (conversation.name || "Unnamed Group") : otherParticipants[0]?.user.name || "Unknown",
        image: isGroup ? null : otherParticipants[0]?.user.image || null,
        isGroup,
        lastMessage: lastMessage
          ? {
              content: lastMessage.content,
              sender: lastMessage.sender.name,
              timestamp: lastMessage.createdAt,
            }
          : null,
      }
    })

    return NextResponse.json({ conversations: formattedConversations })
  } catch (error) {
    console.error("Get conversations error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}
