import { createParser } from 'eventsource-parser';
import { Document } from './types';
import { prisma } from '@/lib/prisma';
import { getEmbedding } from './embeddings';

export async function processDocument(
  file: File,
  userId: string
): Promise<Document> {
  const content = await extractText(file);
  const embedding = await getEmbedding(content);

  const document = await prisma.documents.create({
    data: {
      userId,
      title: file.name,
      content,
      fileType: file.type,
      metadata: {
        size: file.size,
        lastModified: file.lastModified,
      },
    },
  });

  await prisma.vectors.create({
    data: {
      contentType: 'document',
      contentId: document.id,
      embedding,
    },
  });

  return document;
}

async function extractText(file: File): Promise<string> {
  // Implementation varies based on file type
  // This is a simplified version
  const text = await file.text();
  return text;
}