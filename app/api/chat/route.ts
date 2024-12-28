import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createOrchestrationAgent } from "@/lib/ai/agents";
import { StreamingTextResponse, LangChainStream } from 'ai';


export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { messages, model = "gemini-pro" } = await req.json();
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

    // Use orchestrated workflow
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

    // Update chat with response
    await prisma.chat.update({
      where: { id: chat.id },
      data: { response },
    });

    handlers.onToken(response);

    return new StreamingTextResponse(stream);
  } catch (error) {
    console.error("Chat error:", error);
    return new Response("Internal error", { status: 500 });
  }
}