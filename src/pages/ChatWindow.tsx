import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import FramelessTitleBar from "@/components/FramelessTitleBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send, MessageCircle, Phone, Search, Users, Plus, X, Smile,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface ChatContact {
  id: string;
  name: string;
  email: string;
  status: "online" | "offline" | "away" | "dnd";
  unread: number;
  lastMessage?: string;
}

interface ChatMsg {
  id: string;
  senderId: string;
  text: string;
  timestamp: Date;
  isMine: boolean;
}

function getInitials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function getStatusColor(status: string) {
  switch (status) {
    case "online": return "bg-green-500";
    case "away": return "bg-orange-500";
    case "dnd": return "bg-destructive";
    default: return "bg-muted-foreground/40";
  }
}

// Demo data
const DEMO_CONTACTS: ChatContact[] = [
  { id: "1", name: "John Doe", email: "john@company.com", status: "online", unread: 2, lastMessage: "Hey, are you free for a call?" },
  { id: "2", name: "Jane Smith", email: "jane@company.com", status: "away", unread: 0, lastMessage: "Thanks for the update!" },
  { id: "3", name: "Mike Johnson", email: "mike@company.com", status: "online", unread: 0, lastMessage: "Meeting at 3pm" },
  { id: "4", name: "Sarah Wilson", email: "sarah@company.com", status: "offline", unread: 1, lastMessage: "Please review the document" },
];

const DEMO_MESSAGES: ChatMsg[] = [
  { id: "1", senderId: "1", text: "Hey there! 👋", timestamp: new Date(Date.now() - 3600000), isMine: false },
  { id: "2", senderId: "me", text: "Hi John! How's it going?", timestamp: new Date(Date.now() - 3500000), isMine: true },
  { id: "3", senderId: "1", text: "Good! Are you available for a quick call?", timestamp: new Date(Date.now() - 3400000), isMine: false },
  { id: "4", senderId: "me", text: "Sure, let me wrap up this task first. Give me 5 minutes.", timestamp: new Date(Date.now() - 3300000), isMine: true },
  { id: "5", senderId: "1", text: "No rush! Take your time 😊", timestamp: new Date(Date.now() - 3200000), isMine: false },
  { id: "6", senderId: "1", text: "Hey, are you free for a call?", timestamp: new Date(Date.now() - 60000), isMine: false },
];

export default function ChatWindow() {
  const { user } = useAuth();
  const [selectedContact, setSelectedContact] = useState<ChatContact | null>(DEMO_CONTACTS[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>(DEMO_MESSAGES);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const filteredContacts = DEMO_CONTACTS.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSend = () => {
    if (!messageInput.trim()) return;
    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        senderId: "me",
        text: messageInput,
        timestamp: new Date(),
        isMine: true,
      },
    ]);
    setMessageInput("");
  };

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <FramelessTitleBar title="Centelos Chat" showMinimize showClose />

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-64 border-r border-border flex flex-col bg-sidebar">
          {/* Search */}
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 pr-8 text-xs"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
          </div>

          {/* Groups header */}
          <div className="px-3 pt-3 pb-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Groups</span>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Group placeholder */}
          <button className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/60 transition-colors text-left">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate text-sidebar-foreground">Team Chat</p>
              <p className="text-[11px] text-muted-foreground truncate">3 members</p>
            </div>
          </button>

          {/* DMs header */}
          <div className="px-3 pt-3 pb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Direct Messages</span>
          </div>

          {/* Contact list */}
          <ScrollArea className="flex-1">
            {filteredContacts.map((contact) => (
              <button
                key={contact.id}
                onClick={() => setSelectedContact(contact)}
                className={cn(
                  "flex items-center gap-2.5 w-full px-3 py-2 transition-colors text-left",
                  selectedContact?.id === contact.id
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted/60"
                )}
              >
                <div className="relative shrink-0">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">{getInitials(contact.name)}</AvatarFallback>
                  </Avatar>
                  <div className={cn(
                    "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-sidebar",
                    getStatusColor(contact.status)
                  )} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium truncate text-sidebar-foreground">{contact.name}</span>
                    {contact.unread > 0 && (
                      <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">
                        {contact.unread}
                      </Badge>
                    )}
                  </div>
                  {contact.lastMessage && (
                    <p className="text-[11px] text-muted-foreground truncate">{contact.lastMessage}</p>
                  )}
                </div>
              </button>
            ))}
          </ScrollArea>
        </div>

        {/* Conversation */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedContact ? (
            <>
              {/* Conversation header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">{getInitials(selectedContact.name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold">{selectedContact.name}</p>
                    <p className="text-[11px] text-muted-foreground capitalize">{selectedContact.status}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Call">
                  <Phone className="h-4 w-4" />
                </Button>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn("flex", msg.isMine ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                        msg.isMine
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted text-foreground rounded-bl-sm"
                      )}
                    >
                      <p>{msg.text}</p>
                      <p className={cn(
                        "text-[10px] mt-1",
                        msg.isMine ? "text-primary-foreground/60" : "text-muted-foreground"
                      )}>
                        {format(msg.timestamp, "HH:mm")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Message input */}
              <div className="border-t border-border p-3">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <Smile className="h-4 w-4" />
                  </Button>
                  <Input
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder="Type a message…"
                    className="h-9 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={handleSend}
                    disabled={!messageInput.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select a conversation</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
