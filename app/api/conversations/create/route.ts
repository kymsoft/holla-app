import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import prisma from "@/lib/prisma"

export async function POST(request: Request) {
  try {
    const { userId, isGroup, name, userIds } = await request.json()

    const sessionCookies = await cookies()
    const sessionId = sessionCookies.get("session_id")?.value

    if (!sessionId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    // Find session and current user
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    })

    if (!session || session.expires < new Date()) {
      const sessionCookies = await cookies()
      sessionCookies.delete("session_id")
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const currentUserId = session.user.id

    if (isGroup) {
      // Create a group conversation
      if (!name || !userIds || !Array.isArray(userIds) || userIds.length < 2) {
        return NextResponse.json({ message: "Invalid group conversation data" }, { status: 400 })
      }

      // Include current user in the group
      if (!userIds.includes(currentUserId)) {
        userIds.push(currentUserId)
      }

      const conversation = await prisma.conversation.create({
        data: {
          name,
          isGroup: true,
          participants: {
            createMany: {
              data: userIds.map((id) => ({
                userId: id,
              })),
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
        },
      })

      return NextResponse.json({
        conversation: {
          id: conversation.id,
          name: conversation.name,
          isGroup: conversation.isGroup,
          unread: 0,
          online: false,
        },
      })
    } else {
      // Create a one-on-one conversation
      if (!userId) {
        return NextResponse.json({ message: "User ID is required" }, { status: 400 })
      }

      // Check if conversation already exists
      const existingConversation = await prisma.conversation.findFirst({
        where: {
          isGroup: false,
          AND: [
            {
              participants: {
                some: {
                  userId: currentUserId,
                },
              },
            },
            {
              participants: {
                some: {
                  userId,
                },
              },
            },
          ],
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
        },
      })

      if (existingConversation) {
        // Get the other user's details
        const otherUser = existingConversation.participants.find(
          (participant) => participant.userId !== currentUserId,
        )?.user

        return NextResponse.json({
          conversation: {
            id: existingConversation.id,
            name: otherUser?.name || "Unknown User",
            image: otherUser?.image,
            isGroup: false,
            unread: 0,
            online: otherUser?.isOnline || false,
          },
        })
      }

      // Get the other user's details
      const otherUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          image: true,
          isOnline: true,
        },
      })

      if (!otherUser) {
        return NextResponse.json({ message: "User not found" }, { status: 404 })
      }

      // Create a new conversation
      const conversation = await prisma.conversation.create({
        data: {
          isGroup: false,
          participants: {
            createMany: {
              data: [{ userId: currentUserId }, { userId }],
            },
          },
        },
      })

      return NextResponse.json({
        conversation: {
          id: conversation.id,
          name: otherUser.name,
          image: otherUser.image,
          isGroup: false,
          unread: 0,
          online: otherUser.isOnline,
        },
      })
    }
  } catch (error) {
    console.error("Create conversation error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}
