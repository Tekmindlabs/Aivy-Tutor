import { GoogleGenerativeAI } from "@google/generative-ai";
import { StreamingTextResponse, LangChainStream } from "ai";
import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

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

    const genModel = genAI.getGenerativeModel({ model });

    // Generate response
    const prompt = `
      You are an empathetic AI tutor. 
      Respond to: "${lastMessage}"
      Provide a supportive and educational response.
    `;

    const result = await genModel.generateContent(prompt);
    const response = result.response.text();

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