import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createOrchestrationAgent } from "@/lib/ai/agents";
import { StreamingTextResponse, LangChainStream } from 'ai';
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { messages, model =  "learnlm-1.5-pro-experimental" } = await req.json();
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response("Invalid messages format", { status: 400 });
    }

    const lastMessage = messages[messages.length - 1].content;
    const { stream, handlers } = LangChainStream();

    // Create chat in database
    const chat = await prisma.chat.create({
      data: {
        userId: session.user.id,
        message: lastMessage,
        response: "",
      },
    });

    // Process in background to avoid blocking the stream
    (async () => {
      try {
        const workflow = await createOrchestrationAgent();
        const initialState = {
          messages: [lastMessage],
          currentStep: "emotional_analysis",
          emotionalState: "",
          context: {
            role: "master",
            analysis: {},
            recommendations: {}
          }
        };

        const result = await workflow.execute(initialState);
        const response = result.messages[result.messages.length - 1];

        // Stream the response token by token
        const tokens = response.split(' ');
        for (const token of tokens) {
          handlers.onToken(token + ' ');
        }

        // Mark the stream as complete
        handlers.onCompletion(response);

        // Update chat with final response
        await prisma.chat.update({
          where: { id: chat.id },
          data: { response },
        });
      } catch (error) {
        console.error("Workflow processing error:", error);
        handlers.onError(error);
      }
    })();

    return new StreamingTextResponse(stream);
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