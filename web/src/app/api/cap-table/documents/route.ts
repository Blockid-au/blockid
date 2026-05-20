import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Chain RPC helper
// ---------------------------------------------------------------------------

const RPC_URL = "https://chain.blockid.au/evm";
const SVT_CONTRACT = "0xa16E02E87b7454126E5E10d957A927A7F5B5d2be";
const ADMIN_ADDRESS = process.env.ADMIN_EVM_ADDRESS ?? "0x0000000000000000000000000000000000000000";

function padUint256(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

// ---------------------------------------------------------------------------
// Valid document types (ERC-1400 compliance)
// ---------------------------------------------------------------------------

const DOCUMENT_TYPES = [
  "shareholders_agreement",
  "board_resolution",
  "share_certificate",
  "constitution",
  "valuation_report",
] as const;

type DocumentType = (typeof DOCUMENT_TYPES)[number];

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  shareholders_agreement: "Shareholders Agreement (SHA)",
  board_resolution: "Board Resolution",
  share_certificate: "Share Certificate",
  constitution: "Company Constitution",
  valuation_report: "Valuation Report",
};

// ---------------------------------------------------------------------------
// ERC-1400 setDocument selector
// setDocument(bytes32 name, string uri, bytes32 documentHash)
// ---------------------------------------------------------------------------

const SET_DOCUMENT_SELECTOR = "0xdb8c198d";

function encodeSetDocument(
  name: string,
  uri: string,
  documentHash: string,
): string {
  // bytes32 name — utf8 padded to 32 bytes
  const nameBytes = new TextEncoder().encode(name);
  let nameHex = "";
  for (const b of nameBytes) {
    nameHex += b.toString(16).padStart(2, "0");
  }
  const encodedName = nameHex.padEnd(64, "0").slice(0, 64);

  // bytes32 documentHash — already hex
  const hashClean = documentHash.replace("0x", "").padEnd(64, "0").slice(0, 64);

  // string uri — dynamic type with offset
  // Layout: name(32) + offset(32) + hash(32) | uriLen(32) + uriData(padded)
  const encodedOffset = padUint256(96n); // 3 * 32 bytes from start

  const uriBytes = new TextEncoder().encode(uri);
  const encodedUriLen = padUint256(BigInt(uriBytes.length));
  let uriHex = "";
  for (const b of uriBytes) {
    uriHex += b.toString(16).padStart(2, "0");
  }
  const uriPadded = uriHex.padEnd(
    Math.ceil(uriHex.length / 64) * 64,
    "0",
  );

  return (
    SET_DOCUMENT_SELECTOR +
    encodedName +
    encodedOffset +
    hashClean +
    encodedUriLen +
    uriPadded
  );
}

// ---------------------------------------------------------------------------
// GET /api/cap-table/documents — list all on-chain legal documents
// ---------------------------------------------------------------------------

export async function GET(_request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      ok: true,
      documents: [],
      documentTypes: DOCUMENT_TYPES.map((t) => ({
        value: t,
        label: DOCUMENT_TYPE_LABELS[t],
      })),
    });
  }

  const { data: docs, error } = await supabase
    .from("onchain_documents")
    .select("*")
    .eq("account_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[cap-table/documents] GET error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch documents" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    documents: docs ?? [],
    documentTypes: DOCUMENT_TYPES.map((t) => ({
      value: t,
      label: DOCUMENT_TYPE_LABELS[t],
    })),
  });
}

// ---------------------------------------------------------------------------
// POST /api/cap-table/documents — add a document on-chain + DB
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  // Admin-only
  if (user.email !== "admin@blockid.au" && user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Admin access required" },
      { status: 403 },
    );
  }

  let body: {
    name?: string;
    documentType?: string;
    uri?: string;
    documentHash?: string;
    shareholderId?: string;
  } = {};

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { name, documentType, uri, documentHash } = body;

  if (!name || !uri || !documentHash) {
    return NextResponse.json(
      { ok: false, error: "name, uri, and documentHash are required" },
      { status: 400 },
    );
  }

  // Validate document type if provided
  if (
    documentType &&
    !DOCUMENT_TYPES.includes(documentType as DocumentType)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: `Invalid document type. Must be one of: ${DOCUMENT_TYPES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  // Build the on-chain calldata for ERC-1400 setDocument
  const calldata = encodeSetDocument(name, uri, documentHash);

  // Store in DB for quick access
  const supabase = getSupabaseAdmin();
  let dbDocument = null;

  if (supabase) {
    const { data: row, error } = await supabase
      .from("onchain_documents")
      .insert({
        account_id: user.id,
        name,
        document_type: documentType ?? "board_resolution",
        uri,
        document_hash: documentHash,
        shareholder_id: body.shareholderId ?? null,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("[cap-table/documents] POST DB error:", error);
      // Continue anyway — we can still return the tx data
    } else {
      dbDocument = row;
    }
  }

  return NextResponse.json({
    ok: true,
    document: dbDocument,
    txData: {
      to: SVT_CONTRACT,
      data: calldata,
      from: ADMIN_ADDRESS,
      gas: "0x7A120",
      description: `Register document "${name}" on-chain (ERC-1400)`,
    },
  });
}
