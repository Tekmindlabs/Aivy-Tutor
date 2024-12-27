import { prisma } from "@/lib/prisma";
import { getEmbedding } from "./embeddings";

export async function searchKnowledgeBase(
  query: string,
  userId: string,
  limit: number = 10
): Promise<any[]> {
  const queryEmbedding = await getEmbedding(query);

  // Search across all content types
  const results = await prisma.$queryRaw`
    WITH combined_results AS (
      SELECT 
        'document' as type,
        d.id,
        d.title,
        d.content,
        d.created_at,
        v.embedding <-> ${queryEmbedding}::vector as distance
      FROM vectors v
      JOIN documents d ON v.content_id = d.id 
      WHERE v.content_type = 'document' AND d.user_id = ${userId}
      
      UNION ALL
      
      SELECT 
        'url' as type,
        u.id,
        u.title,
        u.content,
        u.created_at,
        v.embedding <-> ${queryEmbedding}::vector as distance
      FROM vectors v
      JOIN urls u ON v.content_id = u.id
      WHERE v.content_type = 'url' AND u.user_id = ${userId}
      
      UNION ALL
      
      SELECT 
        'note' as type,
        n.id,
        n.title,
        n.content,
        n.created_at,
        v.embedding <-> ${queryEmbedding}::vector as distance
      FROM vectors v
      JOIN notes n ON v.content_id = n.id
      WHERE v.content_type = 'note' AND n.user_id = ${userId}
    )
    SELECT *
    FROM combined_results
    ORDER BY distance
    LIMIT ${limit}
  `;

  return results.map((result: any) => ({
    id: result.id,
    type: result.type,
    title: result.title,
    excerpt: result.content.substring(0, 200) + "...",
    createdAt: result.created_at,
    distance: result.distance,
  }));
}