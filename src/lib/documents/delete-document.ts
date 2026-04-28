import { prisma } from "@/lib/db/prisma";
import { deleteFile } from "@/lib/files/storage";

interface DeletableDocument {
  id: string;
  originalFile: string | null;
  archiveFile: string | null;
  thumbnailFile: string | null;
}

function uniquePaths(documents: DeletableDocument[]) {
  return Array.from(
    new Set(
      documents.flatMap((doc) =>
        [doc.originalFile, doc.archiveFile, doc.thumbnailFile].filter(
          (path): path is string => Boolean(path)
        )
      )
    )
  );
}

export async function permanentlyDeleteDocuments(documents: DeletableDocument[]) {
  if (documents.length === 0) return;

  const documentIds = documents.map((doc) => doc.id);
  const paths = uniquePaths(documents);

  await prisma.document.deleteMany({
    where: { id: { in: documentIds } },
  });

  for (const path of paths) {
    const stillReferenced = await prisma.document.count({
      where: {
        OR: [
          { originalFile: path },
          { archiveFile: path },
          { thumbnailFile: path },
        ],
      },
    });

    if (stillReferenced === 0) {
      await deleteFile(path).catch((err) =>
        console.error(`Failed to delete ${path}:`, err)
      );
    }
  }
}
