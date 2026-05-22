import { useParams } from "react-router-dom";
import { EntityProfile } from "@/components/EntityProfile";

export function EntityPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <main className="p-8">Missing entity id.</main>;

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-8 py-8">
      <EntityProfile id={id} />
    </main>
  );
}
