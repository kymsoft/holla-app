import { Button } from "@/components/ui/button"
import Link from "next/link"
import { MessageCircle } from "lucide-react"

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-blue-950 to-slate-950">
      <header className="container mx-auto py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-8 w-8 text-blue-400" />
            <h1 className="text-2xl font-bold text-white">Holla</h1>
          </div>
          <div className="flex gap-4">
            <Button asChild variant="ghost" className="text-blue-200 hover:text-blue-100 hover:bg-blue-900">
              <Link href="/login">Login</Link>
            </Button>
            <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white">
              <Link href="/signup">Sign Up</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto flex-1 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight">
              Connect with friends in real-time
            </h2>
            <p className="text-xl text-blue-200">
              Holla is a fast, secure, and user-friendly messaging platform that keeps you connected with the people who
              matter most.
            </p>
            <div className="flex gap-4">
              <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
                <Link href="/signup">Get Started</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-blue-400 text-blue-400 hover:bg-blue-900/20"
              >
                <Link href="/about">Learn More</Link>
              </Button>
            </div>
          </div>
          <div className="flex justify-center">
            <div className="relative w-full max-w-md aspect-square">
              <div className="absolute inset-0 bg-blue-600 rounded-lg opacity-20 blur-xl"></div>
              <div className="relative bg-slate-900/80 backdrop-blur-sm border border-blue-500/30 rounded-lg p-6 shadow-xl">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                      A
                    </div>
                    <div>
                      <p className="font-medium text-white">Alex</p>
                      <p className="text-xs text-blue-300">Online</p>
                    </div>
                  </div>
                  <div className="bg-blue-900/40 rounded-lg p-3 ml-12 text-blue-100">Hey! How's your day going?</div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold">
                      S
                    </div>
                    <div>
                      <p className="font-medium text-white">Sarah</p>
                      <p className="text-xs text-blue-300">Online</p>
                    </div>
                  </div>
                  <div className="bg-blue-900/40 rounded-lg p-3 ml-12 text-blue-100">
                    Pretty good! Just finished that project we were working on.
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                      A
                    </div>
                    <div>
                      <p className="font-medium text-white">Alex</p>
                      <p className="text-xs text-blue-300">Online</p>
                    </div>
                  </div>
                  <div className="bg-blue-900/40 rounded-lg p-3 ml-12 text-blue-100">
                    That's awesome! Let's celebrate this weekend 🎉
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <footer className="container mx-auto py-6 border-t border-blue-900/50">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-blue-400">© 2025 Holla. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/terms" className="text-blue-400 hover:text-blue-300">
              Terms
            </Link>
            <Link href="/privacy" className="text-blue-400 hover:text-blue-300">
              Privacy
            </Link>
            <Link href="/contact" className="text-blue-400 hover:text-blue-300">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
