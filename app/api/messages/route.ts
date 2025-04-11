import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import prisma from "@/lib/prisma"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get("conversationId")

    if (!conversationId) {
      return NextResponse.json({ message: "Conversation ID is required" }, { status: 400 })
    }

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

    // Check if user is part of the conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: {
          some: {
            userId: currentUserId,
          },
        },
      },
    })

    if (!conversation) {
      return NextResponse.json({ message: "Conversation not found" }, { status: 404 })
    }

    // Get messages
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        status: {
          where: {
            userId: currentUserId,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    })

    // Format messages
    const formattedMessages = messages.map((message) => {
      const status = message.status[0]?.status || "sent"

      return {
        id: message.id,
        content: message.content,
        senderId: message.senderId,
        senderName: message.sender.name,
        senderImage: message.sender.image,
        timestamp: message.createdAt,
        status,
        isOwnMessage: message.senderId === currentUserId,
      }
    })

    // Mark messages as read
    await prisma.messageStatus.updateMany({
      where: {
        userId: currentUserId,
        status: { in: ["sent", "delivered"] },
        message: {
          conversationId,
          senderId: { not: currentUserId },
        },
      },
      data: {
        status: "read",
        readAt: new Date(),
      },
    })

    return NextResponse.json({ messages: formattedMessages })
  } catch (error) {
    console.error("Get messages error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}
