import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import prisma from "@/lib/prisma"

export async function POST(request: Request) {
  try {
    const { conversationId, content, localMessageId } = await request.json()

    if (!conversationId || !content) {
      return NextResponse.json({ message: "Conversation ID and content are required" }, { status: 400 })
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

    // Check if user is part of the conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: {
          some: {
            userId: session.user.id,
          },
        },
      },
    })

    if (!conversation) {
      return NextResponse.json({ message: "Conversation not found" }, { status: 404 })
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        content,
        conversationId,
        senderId: session.user.id,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    })

    // Get all participants in this conversation
    const participants = await prisma.participant.findMany({
      where: { conversationId },
      select: { userId: true },
    })

    // Create message status entries for all participants
    await Promise.all(
      participants.map(async (participant) => {
        const isSender = participant.userId === session.user.id

        // Check if the participant is online
        const participantUser = await prisma.user.findUnique({
          where: { id: participant.userId },
          select: { isOnline: true },
        })

        const isOnline = participantUser?.isOnline || false

        await prisma.messageStatus.create({
          data: {
            messageId: message.id,
            userId: participant.userId,
            status: isSender ? "sent" : isOnline ? "delivered" : "sent",
            deliveredAt: isOnline && !isSender ? new Date() : null,
          },
        })
      }),
    )

    // Update conversation's last message
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({
      message: {
        id: message.id,
        localMessageId,
        content: message.content,
        senderId: message.senderId,
        senderName: message.sender.name,
        senderImage: message.sender.image,
        timestamp: message.createdAt,
        status: "sent",
        isOwnMessage: true,
      },
    })
  } catch (error) {
    console.error("Send message error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}
