import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import prisma from "@/lib/prisma"

export async function GET() {
  try {
    const sessionId = (await cookies()).get("session_id")?.value

    if (!sessionId) {
      return NextResponse.json({ user: null })
    }

    // Find session
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    })

    // Check if session exists and is not expired
    if (!session || session.expires < new Date()) {
      (await cookies()).delete("session_id")
      return NextResponse.json({ user: null })
    }

    // Return user data (excluding password)
    return NextResponse.json({
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      },
    })
  } catch (error) {
    console.error("Session error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}
