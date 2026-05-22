import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Providers } from "@/components/Providers";
import { AboutPage } from "@/pages/AboutPage";
import { AnomaliesPage } from "@/pages/AnomaliesPage";
import { EntityPage } from "@/pages/EntityPage";
import { HomePage } from "@/pages/HomePage";
import { SearchPage } from "@/pages/SearchPage";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";

export default function App() {
  return (
    <Providers>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-white text-neutral-900">
          <Header />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/entity/:id" element={<EntityPage />} />
            <Route path="/anomalies" element={<AnomaliesPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Footer />
        </div>
      </BrowserRouter>
    </Providers>
  );
}

function NotFound() {
  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-8 py-12 text-center">
      <h1 className="text-3xl font-bold mb-4">Page not found</h1>
      <p className="text-neutral-600">
        Try searching from the{" "}
        <Link to="/" className="underline">
          homepage
        </Link>
        .
      </p>
    </main>
  );
}
