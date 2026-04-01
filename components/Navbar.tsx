import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 grid grid-cols-3 items-center px-10 py-5">
      <Link href="/" className="text-2xl font-extrabold tracking-tight text-black drop-shadow-lg">
        Zero Training
      </Link>

      <div className="flex items-center justify-center gap-10">
        <Link href="/tasks" className="text-base font-semibold text-black/70 transition hover:text-black drop-shadow-md">
          Tasks
        </Link>
        <Link href="/models" className="text-base font-semibold text-black/70 transition hover:text-black drop-shadow-md">
          Models
        </Link>
        <Link href="/create" className="text-base font-semibold text-black/70 transition hover:text-black drop-shadow-md">
          Create
        </Link>
        <Link href="/use" className="text-base font-semibold text-black/70 transition hover:text-black drop-shadow-md">
          Use Model
        </Link>
      </div>

      <div className="flex justify-end">
        <ConnectButton />
      </div>
    </nav>
  );
}
