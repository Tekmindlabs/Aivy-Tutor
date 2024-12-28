import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createOrchestrationAgent, AgentRole, AgentState } from "@/lib/ai/agents";
import { StreamingTextResponse, LangChainStream } from 'ai';
import { prisma } from "@/lib/prisma";

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

    // Parse request body
    const { messages } = await req.json();
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response("Invalid messages format", { status: 400 });
    }

    const lastMessage = messages[messages.length - 1].content;
    
    // Create streaming handlers correctly
    const { stream, handlers: streamHandlers } = LangChainStream();

    // Create chat record in database
    const chat = await prisma.chat.create({
      data: {
        userId: user.id,
        message: lastMessage,
        response: "", // Initial empty response
      },
    });

    // Process in background to avoid blocking the stream
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

        // Stream the response using handleLLMNewToken
        const chunks = response.split(' ');
        for (const chunk of chunks) {
          await streamHandlers.handleLLMNewToken(chunk + ' ');
        }

        // Signal end of streaming using handleLLMEnd
        await streamHandlers.handleLLMEnd({ generations: [] }, "");

        // Update chat with final response
        await prisma.chat.update({
          where: { id: chat.id },
          data: { response },
        });

      } catch (error) {
        console.error("Workflow processing error:", error);
        
        const errorMessage = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        
        // Send error through stream using handleLLMNewToken
        await streamHandlers.handleLLMNewToken(errorMessage);
        await streamHandlers.handleLLMEnd({ generations: [] }, "");

        // Update chat with error
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
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error occurred" 
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}