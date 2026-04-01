export default function Home() {
  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute left-1/2 top-1/2 min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 object-cover"
      >
        <source src="/landing.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
