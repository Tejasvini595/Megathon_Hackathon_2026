import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOwnedHome } from "@/lib/homes";
import { getChat } from "../../actions";
import { AskView } from "../../ask-view";

export const metadata: Metadata = { title: "Ask" };

type Params = PageProps<"/ask/[id]/[[...chat]]">["params"];

/** /ask/[home] is a new chat; /ask/[home]/[chat] reopens a saved one. */
export default function Page({ params }: PageProps<"/ask/[id]/[[...chat]]">) {
  return (
    <div className="flex min-h-dvh flex-col px-5 pt-safe pb-44">
      <Suspense>
        <View params={params} />
      </Suspense>
    </div>
  );
}

async function View({ params }: { params: Params }) {
  const { id, chat } = await params;
  const { home } = await getOwnedHome(id);
  if (chat && chat.length > 1) notFound();
  const messages = chat ? await getChat(home.id, chat[0]) : [];
  if (!messages) notFound();
  return <AskView key={home.id} homeId={home.id} homeName={home.nickname} chatId={chat?.[0] ?? null} initial={messages} />;
}
