"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { MessageCircle, ArrowLeft, User, Bell, Shield, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useAuth } from "@/app/auth-provider"
import { useToast } from "@/components/ui/use-toast";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { user } = useAuth()
  const { toast } = useToast()
  const [name, setName] = useState(user?.name || "")
  const [email, setEmail] = useState(user?.email || "")
  const [notifications, setNotifications] = useState({
    messages: true,
    mentions: true,
    newUsers: false,
    marketing: false,
  })

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault()
    toast({
      title: "Profile updated",
      description: "Your profile has been updated successfully.",
    })
  }

  const handleSaveNotifications = (e: React.FormEvent) => {
    e.preventDefault()
    toast({
      title: "Notification settings updated",
      description: "Your notification preferences have been saved.",
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 to-slate-950 dark:from-blue-950 dark:to-slate-950 light:from-blue-100 light:to-white">
      <header className="border-b border-blue-800/30 dark:border-blue-800/30 light:border-blue-200/50">
        <div className="container mx-auto py-3 px-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="text-blue-300 hover:text-blue-100 hover:bg-blue-900/50"
            >
              <Link href="/chat">
                <ArrowLeft className="h-5 w-5" />
                <span className="sr-only">Back to chat</span>
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <MessageCircle className="h-6 w-6 text-blue-400" />
              <h1 className="text-xl font-bold text-white dark:text-white light:text-blue-900">Holla</h1>
            </div>
          </div>
        </div>
      </header>
      <main className="container mx-auto py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>

          <Tabs defaultValue="profile" className="space-y-6">
            <TabsList className="bg-slate-800/50 border border-blue-800/30">
              <TabsTrigger value="profile" className="data-[state=active]:bg-blue-600">
                <User className="h-4 w-4 mr-2" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="notifications" className="data-[state=active]:bg-blue-600">
                <Bell className="h-4 w-4 mr-2" />
                Notifications
              </TabsTrigger>
              <TabsTrigger value="appearance" className="data-[state=active]:bg-blue-600">
                <Moon className="h-4 w-4 mr-2" />
                Appearance
              </TabsTrigger>
              <TabsTrigger value="privacy" className="data-[state=active]:bg-blue-600">
                <Shield className="h-4 w-4 mr-2" />
                Privacy
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <Card className="border-blue-800/30 bg-slate-900/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white">Profile Settings</CardTitle>
                  <CardDescription className="text-blue-300">Manage your account information</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSaveProfile} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-blue-100">
                        Full Name
                      </Label>
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="bg-slate-800 border-blue-800/50 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-blue-100">
                        Email
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="bg-slate-800 border-blue-800/50 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="avatar" className="text-blue-100">
                        Profile Picture
                      </Label>
                      <div className="flex items-center gap-4">
                        <div className="h-16 w-16 rounded-full bg-blue-700 flex items-center justify-center text-white text-xl font-bold">
                          {name.charAt(0)}
                        </div>
                        <Button variant="outline" className="border-blue-500 text-blue-400 hover:bg-blue-900/20">
                          Change
                        </Button>
                      </div>
                    </div>
                    <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
                      Save Changes
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notifications">
              <Card className="border-blue-800/30 bg-slate-900/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white">Notification Settings</CardTitle>
                  <CardDescription className="text-blue-300">
                    Manage how and when you receive notifications
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSaveNotifications} className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-blue-100">New Messages</Label>
                          <p className="text-xs text-blue-400">Receive notifications for new messages</p>
                        </div>
                        <Switch
                          checked={notifications.messages}
                          onCheckedChange={(checked) => setNotifications({ ...notifications, messages: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-blue-100">Mentions</Label>
                          <p className="text-xs text-blue-400">Receive notifications when you are mentioned</p>
                        </div>
                        <Switch
                          checked={notifications.mentions}
                          onCheckedChange={(checked) => setNotifications({ ...notifications, mentions: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-blue-100">New Users</Label>
                          <p className="text-xs text-blue-400">Receive notifications when new users join</p>
                        </div>
                        <Switch
                          checked={notifications.newUsers}
                          onCheckedChange={(checked) => setNotifications({ ...notifications, newUsers: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-blue-100">Marketing</Label>
                          <p className="text-xs text-blue-400">Receive marketing and promotional emails</p>
                        </div>
                        <Switch
                          checked={notifications.marketing}
                          onCheckedChange={(checked) => setNotifications({ ...notifications, marketing: checked })}
                        />
                      </div>
                    </div>
                    <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
                      Save Preferences
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="appearance">
              <Card className="border-blue-800/30 bg-slate-900/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white">Appearance Settings</CardTitle>
                  <CardDescription className="text-blue-300">Customize how Holla looks for you</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <Label className="text-blue-100">Theme</Label>
                    <div className="grid grid-cols-3 gap-4">
                      <Button
                        variant="outline"
                        className={`flex flex-col items-center gap-2 h-auto p-4 ${theme === "dark" ? "border-blue-500 bg-blue-900/20" : "border-blue-800/30"}`}
                        onClick={() => setTheme("dark")}
                      >
                        <Moon className="h-6 w-6 text-blue-400" />
                        <span className="text-blue-100">Dark</span>
                      </Button>
                      <Button
                        variant="outline"
                        className={`flex flex-col items-center gap-2 h-auto p-4 ${theme === "light" ? "border-blue-500 bg-blue-900/20" : "border-blue-800/30"}`}
                        onClick={() => setTheme("light")}
                      >
                        <Sun className="h-6 w-6 text-blue-400" />
                        <span className="text-blue-100">Light</span>
                      </Button>
                      <Button
                        variant="outline"
                        className={`flex flex-col items-center gap-2 h-auto p-4 ${theme === "system" ? "border-blue-500 bg-blue-900/20" : "border-blue-800/30"}`}
                        onClick={() => setTheme("system")}
                      >
                        <div className="flex">
                          <Moon className="h-6 w-6 text-blue-400" />
                          <Sun className="h-6 w-6 text-blue-400 -ml-2" />
                        </div>
                        <span className="text-blue-100">System</span>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="privacy">
              <Card className="border-blue-800/30 bg-slate-900/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white">Privacy Settings</CardTitle>
                  <CardDescription className="text-blue-300">
                    Manage your privacy and security preferences
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-blue-100">Online Status</Label>
                        <p className="text-xs text-blue-400">Show when you are online to others</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-blue-100">Read Receipts</Label>
                        <p className="text-xs text-blue-400">Let others know when you've read their messages</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-blue-100">Two-Factor Authentication</Label>
                        <p className="text-xs text-blue-400">Add an extra layer of security to your account</p>
                      </div>
                      <Button variant="outline" className="border-blue-500 text-blue-400 hover:bg-blue-900/20">
                        Enable
                      </Button>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-blue-800/30">
                    <Button variant="destructive" className="bg-red-600 hover:bg-red-700">
                      Delete Account
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
}
