import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { EntityProfile } from "@/components/EntityProfile";

export default async function EntityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-8 py-8">
        <EntityProfile id={id} />
      </main>
      <Footer />
    </div>
  );
}
