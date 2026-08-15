"use client";

import * as React from "react";
import { CheckCircle2, Send } from "lucide-react";

export function ContactForm() {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [status, setStatus] = React.useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@") || !message.trim()) {
      setErrorMsg("Please fill in all required fields.");
      return;
    }

    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "contact",
          email: email.trim(),
          payload: { name: name.trim(), message: message.trim() },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("success");
        setName("");
        setEmail("");
        setMessage("");
      } else {
        setStatus("error");
        setErrorMsg(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    }
  };

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-[rgba(0,212,255,0.3)] bg-[rgba(0,212,255,0.08)] p-8 text-center">
        <CheckCircle2
          strokeWidth={1.75}
          className="mx-auto h-10 w-10 text-[#00D4FF] mb-4"
        />
        <h3 className="text-lg font-bold text-[#F8FAFC] mb-2">
          Message sent!
        </h3>
        <p className="text-sm text-[#94A3B8]">
          Thanks for reaching out. We will get back to you within one business
          day.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-4 text-sm text-[#00D4FF] hover:underline cursor-pointer"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label
          htmlFor="contact-name"
          className="block text-sm font-medium text-[#F8FAFC] mb-1.5"
        >
          Name
        </label>
        <input
          id="contact-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="w-full h-11 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 text-sm text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:border-[rgba(0,212,255,0.5)] focus:ring-1 focus:ring-[rgba(0,212,255,0.3)] transition-colors"
        />
      </div>
      <div>
        <label
          htmlFor="contact-email"
          className="block text-sm font-medium text-[#F8FAFC] mb-1.5"
        >
          Email <span className="text-red-400">*</span>
        </label>
        <input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          className="w-full h-11 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 text-sm text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:border-[rgba(0,212,255,0.5)] focus:ring-1 focus:ring-[rgba(0,212,255,0.3)] transition-colors"
        />
      </div>
      <div>
        <label
          htmlFor="contact-message"
          className="block text-sm font-medium text-[#F8FAFC] mb-1.5"
        >
          Message <span className="text-red-400">*</span>
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="How can we help?"
          required
          rows={5}
          className="w-full rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:border-[rgba(0,212,255,0.5)] focus:ring-1 focus:ring-[rgba(0,212,255,0.3)] transition-colors resize-none"
        />
      </div>
      {errorMsg && (
        <p className="text-sm text-red-400">{errorMsg}</p>
      )}
      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-[#00D4FF] to-[#0066FF] px-6 text-sm font-semibold text-[#0A0F1E] hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
      >
        {status === "submitting" ? (
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded-full border-2 border-[#0A0F1E]/30 border-t-[#0A0F1E] animate-spin" />
            Sending...
          </span>
        ) : (
          <>
            Send Message <Send strokeWidth={1.75} className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}
