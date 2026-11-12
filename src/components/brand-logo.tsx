import Image from "next/image";

export function BrandLogo({ className = "h-10 w-auto max-w-full object-contain object-left" }: { className?: string }) {
  return (
    <Image
      src="/BLUE.png"
      alt="Indian Institute of Commerce Lakshya"
      width={640}
      height={160}
      priority
      className={className}
    />
  );
}
