
import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createOrchestrationAgent, AgentRole, AgentState } from "@/lib/ai/agents";
import { StreamingTextResponse, LangChainStream, Message } from 'ai';
import { prisma } from "@/lib/prisma";
import { ChatCompletionMessage } from "ai/react";

export const runtime = 'edge'; // Enable edge runtime

export async function POST(req: NextRequest) {
  try {
    // Get user session and verify authentication
    const session = await getSession();
    if (!session?.user?.email) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Find the user in database to ensure they exist
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user?.id) {
      return new Response("User not found", { status: 404 });
    }

    // Parse request body with proper typing
    const { messages }: { messages: ChatCompletionMessage[] } = await req.json();
    
    if (!messages?.length) {
      return new Response("No messages provided", { status: 400 });
    }

    const lastMessage = messages[messages.length - 1].content;
    
    // Create proper stream with Vercel AI SDK
    const { stream, handlers } = LangChainStream();

    // Create chat record in database
    const chat = await prisma.chat.create({
      data: {
        userId: user.id,
        message: lastMessage,
        response: "",
      },
    });

    // Process in background
    (async () => {
      try {
        const workflow = await createOrchestrationAgent();
        const initialState: AgentState = {
          messages: [lastMessage],
          currentStep: "emotional_analysis",
          emotionalState: "",
          context: {
            role: "master" as AgentRole,
            analysis: {},
            recommendations: {}
          }
        };

        const result = await workflow.execute(initialState);
        
        if (!result?.messages?.length) {
          throw new Error("Invalid response from workflow");
        }

        const response = result.messages[result.messages.length - 1];

        // Stream response chunks with proper markdown formatting
        const chunks = response.split(/(\n\n|\n(?=[#-]))/);
        for (const chunk of chunks) {
          if (chunk.trim()) {
            await handlers.handleLLMNewToken(chunk);
          }
        }

        await handlers.handleLLMEnd();

        // Update chat record with final response
        await prisma.chat.update({
          where: { id: chat.id },
          data: { response },
        });

      } catch (error) {
        console.error("Workflow error:", error);
        
        const errorMessage = error instanceof Error 
          ? `Error: ${error.message}`
          : "An unexpected error occurred";

        await handlers.handleLLMNewToken(errorMessage);
        await handlers.handleLLMEnd();

        // Update chat with error message
        await prisma.chat.update({
          where: { id: chat.id },
          data: { 
            response: errorMessage,
          },
        });
      }
    })();

    // Return streaming response
    return new StreamingTextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
    
  } catch (error) {
    console.error("API error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Internal server error" 
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Optionally add a GET route to fetch chat history
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.email) {
      return new Response("Unauthorized", { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        chats: {
          orderBy: { createdAt: 'desc' },
          take: 50, // Limit to last 50 chats
        },
      },
    });

    if (!user) {
      return new Response("User not found", { status: 404 });
    }

    return new Response(
      JSON.stringify({ chats: user.chats }), 
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error("Get chats error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Internal server error" 
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}