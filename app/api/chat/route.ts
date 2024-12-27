import { GoogleGenerativeAI } from "@google/generative-ai";
import { StreamingTextResponse, LangChainStream } from "ai";
import { AgentGraph } from "@langchain/langgraph";
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { messages, model = "gemini-pro" } = await req.json();
    const lastMessage = messages[messages.length - 1].content;

    const { stream, handlers } = LangChainStream();

    // Store the chat message
    await prisma.chat.create({
      data: {
        userId: session.user.id,
        message: lastMessage,
        response: "", // Will be updated with the response
      },
    });

    const genModel = genAI.getGenerativeModel({ model });

    // Create agent graph for emotional analysis and response
    const workflow = new AgentGraph()
      .addNode("emotional_analysis", async (state: any) => {
        const result = await genModel.generateContent(`
          Analyze the emotional state in this message: "${state.message}"
          Provide a brief emotional assessment.
        `);
        return {
          ...state,
          emotion: result.response.text(),
        };
      })
      .addNode("generate_response", async (state: any) => {
        const prompt = `
          You are an empathetic AI tutor. Based on the student's emotional state: ${state.emotion}
          Respond to: "${state.message}"
          Provide a supportive and educational response.
        `;
        
        const result = await genModel.generateContent(prompt);
        const response = result.response.text();
        
        // Update chat with response
        await prisma.chat.update({
          where: { id: state.chatId },
          data: { response },
        });

        handlers.onToken(response);
        return state;
      })
      .setEntryPoint("emotional_analysis")
      .addEdge("emotional_analysis", "generate_response");

    // Execute workflow
    workflow.execute({
      message: lastMessage,
      chatId: session.user.id,
    });

    return new StreamingTextResponse(stream);
  } catch (error) {
    console.error("Chat error:", error);
    return new Response("Internal error", { status: 500 });
  }
}