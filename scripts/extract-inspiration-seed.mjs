import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, "..");
const prototypePath = path.join(rootDirectory, "prototype/index.html");
const manifestPath = path.join(rootDirectory, "prototype/assets/inspiration/manifest.json");
const outputPath = path.join(rootDirectory, "packages/db/prisma/seed-data/inspirations.json");

const categoryMap = {
  人像: "PORTRAIT",
  摄影: "PHOTOGRAPHY",
  动漫: "ANIME",
  插画: "ILLUSTRATION",
  设计: "DESIGN",
};

function readLiteral(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  if (ts.isObjectLiteralExpression(node)) {
    return Object.fromEntries(
      node.properties.map((property) => {
        if (!ts.isPropertyAssignment(property)) {
          throw new Error(`Unsupported artwork property: ${property.getText()}`);
        }
        const name = property.name.getText().replaceAll(/["']/g, "");
        return [name, readLiteral(property.initializer)];
      }),
    );
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map(readLiteral);
  }
  throw new Error(`Unsupported artwork value: ${node.getText()}`);
}

const prototype = fs.readFileSync(prototypePath, "utf8");
const declarationStart = prototype.indexOf("const artworks = [");
const declarationEnd = prototype.indexOf("const authStorageKey", declarationStart);
if (declarationStart < 0 || declarationEnd < 0) {
  throw new Error("Unable to locate the prototype artworks declaration");
}

const source = ts.createSourceFile(
  "artworks.ts",
  prototype.slice(declarationStart, declarationEnd),
  ts.ScriptTarget.ESNext,
  true,
  ts.ScriptKind.TS,
);
const declaration = source.statements[0];
if (!ts.isVariableStatement(declaration)) {
  throw new Error("Prototype artworks declaration is not a variable statement");
}

const initializer = declaration.declarationList.declarations[0]?.initializer;
if (!initializer || !ts.isArrayLiteralExpression(initializer)) {
  throw new Error("Prototype artworks value is not an array");
}

const artworks = readLiteral(initializer);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const manifestByFile = new Map(manifest.items.map((item) => [item.file, item]));

const records = artworks.map((artwork, index) => {
  const file = path.basename(artwork.image);
  const metadata = manifestByFile.get(file);
  if (!metadata) {
    throw new Error(`Missing manifest metadata for ${file}`);
  }
  const category = categoryMap[metadata.category];
  if (!category) {
    throw new Error(`Unsupported category ${metadata.category}`);
  }

  return {
    slug: path.basename(file, path.extname(file)),
    title: artwork.title,
    prompt: metadata.prompt,
    category,
    imagePath: `/inspiration/${file}`,
    thumbnailPath: `/inspiration/${file}`,
    width: metadata.width,
    height: metadata.height,
    modelName: metadata.model,
    ratio: metadata.ratio,
    resolutionLabel: artwork.resolution ?? `${metadata.width} × ${metadata.height}`,
    authorDisplayName: artwork.author,
    sourceType: "AI_PUBLIC_GALLERY",
    sourceName: artwork.source,
    sourceUrl: metadata.workUrl ?? null,
    licenseBasis: "原型演示素材，正式商用前需复核授权",
    isAiGenerated: true,
    likeCount: artwork.likes,
    sortOrder: index,
    status: "PUBLISHED",
    publishedAt: "2026-07-31T00:00:00.000Z",
  };
});

if (records.length !== manifest.items.length) {
  throw new Error(
    `Artwork count mismatch: prototype=${records.length}, manifest=${manifest.items.length}`,
  );
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(records, null, 2)}\n`);
console.log(`Generated ${records.length} inspiration seed records at ${outputPath}`);
