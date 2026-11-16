import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Providers } from "./providers";
import { loadDoc } from "./docs/load.ts";
import { AppSidebar } from "./sidebar.tsx";
import "./globals.css";

// Mono is Lamproom's voice (ids, steps, numbers); sans only for prose a person wrote or reads.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Lamproom",
  description: "Design the flows that agents run.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { toc } = await loadDoc(); // the docs submenu lists the guide's sections
  return (
    <html lang="en" className={`${plexMono.variable} ${plexSans.variable}`}>
      <body>
        <Providers>
          <TooltipProvider>
            {/* ponytail: the rail opens expanded on every load; read the sidebar_state cookie here if remembering it matters */}
            <SidebarProvider>
              <AppSidebar docs={toc} />
              <div className="relative flex min-w-0 flex-1 flex-col">
                {children}
                {/* Below md the rail is a drawer, and no page header has room for its button. */}
                <SidebarTrigger className="fixed right-3 bottom-3 z-40 border border-input bg-card md:hidden" />
              </div>
            </SidebarProvider>
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
