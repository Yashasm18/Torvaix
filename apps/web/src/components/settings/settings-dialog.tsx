"use client"

import * as React from "react"
import { Monitor, Key, Shield, HardDrive, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { THEMES, Theme } from "@/lib/themes"
import { Label } from "@/components/ui/label"

export function SettingsDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (o: boolean) => void }) {
  const { theme, setTheme } = useTheme()
  const [telemetry, setTelemetry] = React.useState(false) // Default OFF

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your preferences, API keys, and privacy settings.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex flex-col md:flex-row gap-6 mt-4">
          <TabsList className="flex flex-col h-auto bg-transparent items-start justify-start w-40 space-y-1">
            <TabsTrigger value="general" className="w-full justify-start data-[state=active]:bg-muted">
              <Monitor className="h-4 w-4 mr-2" /> General
            </TabsTrigger>
            <TabsTrigger value="appearance" className="w-full justify-start data-[state=active]:bg-muted">
              <Moon className="h-4 w-4 mr-2" /> Appearance
            </TabsTrigger>
            <TabsTrigger value="api-keys" className="w-full justify-start data-[state=active]:bg-muted">
              <Key className="h-4 w-4 mr-2" /> API Keys
            </TabsTrigger>
            <TabsTrigger value="privacy" className="w-full justify-start data-[state=active]:bg-muted">
              <Shield className="h-4 w-4 mr-2" /> Privacy
            </TabsTrigger>
            <TabsTrigger value="local" className="w-full justify-start data-[state=active]:bg-muted">
              <HardDrive className="h-4 w-4 mr-2" /> Local AI
            </TabsTrigger>
          </TabsList>

          <div className="flex-1">
            <TabsContent value="appearance" className="m-0 space-y-4">
              <h3 className="text-lg font-medium">Theme</h3>
              <p className="text-sm text-muted-foreground">Select a theme for the Torvaix workspace.</p>
              <div className="grid grid-cols-2 gap-4 mt-4">
                {THEMES.map((t) => (
                  <div 
                    key={t.id} 
                    className={`border rounded-xl p-4 cursor-pointer transition-all ${theme === t.id ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-muted-foreground/50'}`}
                    onClick={() => setTheme(t.id)}
                  >
                    <div className="font-medium mb-1">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.description}</div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="api-keys" className="m-0 space-y-4">
              <h3 className="text-lg font-medium">API Keys</h3>
              <p className="text-sm text-muted-foreground">
                Enter your API keys. <strong>Keys are stored locally on your device.</strong>
              </p>
              
              <div className="space-y-4 mt-6">
                <div className="space-y-2">
                  <Label>OpenAI API Key</Label>
                  <Input type="password" placeholder="sk-..." className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label>Anthropic API Key</Label>
                  <Input type="password" placeholder="sk-ant-..." className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label>Google Gemini API Key</Label>
                  <Input type="password" placeholder="AIza..." className="font-mono text-sm" />
                </div>
                <Button className="w-full mt-2">Save Keys</Button>
              </div>
            </TabsContent>

            <TabsContent value="privacy" className="m-0 space-y-4">
              <h3 className="text-lg font-medium">Privacy</h3>
              <div className="flex items-center justify-between mt-4 p-4 border rounded-xl bg-muted/30">
                <div className="space-y-0.5">
                  <Label className="text-base">Anonymous Telemetry</Label>
                  <p className="text-sm text-muted-foreground">
                    Help improve Torvaix by sending anonymous usage data.
                  </p>
                </div>
                <Switch 
                  checked={telemetry} 
                  onCheckedChange={setTelemetry} 
                />
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Torvaix is privacy-first. We do not log your chat history or prompts on any central server.
              </p>
            </TabsContent>
            
            <TabsContent value="local" className="m-0 space-y-4">
              <h3 className="text-lg font-medium">Ollama Configuration</h3>
              <p className="text-sm text-muted-foreground">Connect to your local Ollama instance.</p>
              <div className="space-y-2 mt-4">
                <Label>Ollama Endpoint URL</Label>
                <div className="flex gap-2">
                  <Input defaultValue="http://localhost:11434" className="font-mono text-sm" />
                  <Button variant="secondary">Test</Button>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
