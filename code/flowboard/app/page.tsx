import { redirect } from "next/navigation";

/** The flow designer is the only screen so far. */
export default function Home() {
  redirect("/flows");
}
