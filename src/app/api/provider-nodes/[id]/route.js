import { NextResponse } from "next/server";
import { deleteProviderConnectionsByProvider, deleteProviderNode, getProviderConnections, getProviderNodeById, updateProviderConnection, updateProviderNode } from "@/models";
import { getRequestLocale, localizedProviderMessage } from "@/lib/i18n/requestLocale";

export async function PUT(request, { params }) {
  const locale = getRequestLocale(request);
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, prefix, apiType, baseUrl, systemPrompt } = body;
    const node = await getProviderNodeById(id);

    if (!node) {
      return NextResponse.json({ error: localizedProviderMessage(locale, "providerNodeNotFound") }, { status: 404 });
    }

    const finalName = name !== undefined ? name.trim() : node.name;
    const finalPrefix = prefix !== undefined ? prefix.trim() : node.prefix;
    const finalBaseUrl = baseUrl !== undefined ? baseUrl.trim() : node.baseUrl;
    const finalApiType = apiType !== undefined ? apiType : node.apiType;

    if (!finalName?.trim()) {
      return NextResponse.json({ error: localizedProviderMessage(locale, "nameRequired") }, { status: 400 });
    }

    if (!finalPrefix?.trim()) {
      return NextResponse.json({ error: localizedProviderMessage(locale, "prefixRequired") }, { status: 400 });
    }

    if (node.type === "openai-compatible" && (!finalApiType || !["chat", "responses"].includes(finalApiType))) {
      return NextResponse.json({ error: localizedProviderMessage(locale, "apiTypeInvalid") }, { status: 400 });
    }

    if (!finalBaseUrl?.trim()) {
      return NextResponse.json({ error: localizedProviderMessage(locale, "baseUrlRequired") }, { status: 400 });
    }

    let sanitizedBaseUrl = finalBaseUrl.trim();
    
    if (node.type === "anthropic-compatible") {
      sanitizedBaseUrl = sanitizedBaseUrl.replace(/\/$/, "");
      if (sanitizedBaseUrl.endsWith("/messages")) {
        sanitizedBaseUrl = sanitizedBaseUrl.slice(0, -9); // remove /messages
      }
    }

    if (node.type === "custom-embedding") {
      sanitizedBaseUrl = sanitizedBaseUrl.replace(/\/$/, "");
      if (sanitizedBaseUrl.endsWith("/embeddings")) {
        sanitizedBaseUrl = sanitizedBaseUrl.slice(0, -"/embeddings".length);
      }
    }

    const updates = {
      name: finalName.trim(),
      prefix: finalPrefix.trim(),
      baseUrl: sanitizedBaseUrl,
      systemPrompt: systemPrompt !== undefined ? systemPrompt || null : node.systemPrompt,
    };

    if (node.type === "openai-compatible") {
      updates.apiType = finalApiType;
    }

    const updated = await updateProviderNode(id, updates);

    const connections = await getProviderConnections({ provider: id });
    await Promise.all(connections.map((connection) => (
      updateProviderConnection(connection.id, {
        providerSpecificData: {
          ...(connection.providerSpecificData || {}),
          prefix: finalPrefix.trim(),
          apiType: node.type === "openai-compatible" ? finalApiType : undefined,
          baseUrl: sanitizedBaseUrl,
          nodeName: updated.name,
          systemPrompt: systemPrompt !== undefined ? systemPrompt || null : connection.providerSpecificData?.systemPrompt,
        }
      })
    )));

    return NextResponse.json({ node: updated });
  } catch (error) {
    console.log("Error updating provider node:", error);
    return NextResponse.json({ error: localizedProviderMessage(locale, "failedUpdateNode") }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const locale = getRequestLocale(request);
  try {
    const { id } = await params;
    const node = await getProviderNodeById(id);

    if (!node) {
      return NextResponse.json({ error: localizedProviderMessage(locale, "providerNodeNotFound") }, { status: 404 });
    }

    await deleteProviderConnectionsByProvider(id);
    await deleteProviderNode(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting provider node:", error);
    return NextResponse.json({ error: localizedProviderMessage(locale, "failedDeleteNode") }, { status: 500 });
  }
}
