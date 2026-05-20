#!/usr/bin/env python3
"""Generate TTS audio for BlockID.au pitch videos using edge-tts."""
import asyncio
import edge_tts
import os
import subprocess

VOICE = "en-AU-WilliamMultilingualNeural"
OUT_1MIN = "/home/dovanlong/blockid.au/web/public/video-assets/audio/1min-new"
OUT_3MIN = "/home/dovanlong/blockid.au/web/public/video-assets/audio/3min-new"

# =============================================================================
# 1-MINUTE PITCH — scenes derived from voiceover-1min.md
# Scene 1 (Logo Reveal) has no voiceover
# =============================================================================
SCENES_1MIN = [
    ("02-problem-stats", """
        <speak>
            <break time="300ms"/>
            <prosody rate="-5%" pitch="+2st">Ninety percent</prosody> of startups fail.
            <break time="500ms"/>
            In Australia, <prosody rate="-5%" pitch="+2st">three hundred and seventy thousand</prosody> businesses
            <prosody pitch="+1st">closed last year</prosody> alone.
        </speak>
    """),
    ("03-ai-explosion", """
        <speak>
            <break time="300ms"/>
            <prosody rate="-5%" pitch="+2st">Ninety-seven billion dollars</prosody>
            <prosody pitch="+1st">poured into AI startups</prosody> in twenty twenty-four alone.
            <break time="400ms"/>
            But <prosody rate="-5%" pitch="+2st">ninety percent</prosody> of AI startups
            <prosody rate="+5%">still</prosody> fail.
            <prosody rate="+5%">Average lifespan:</prosody>
            <prosody rate="-5%" pitch="+2st">eighteen months.</prosody>
        </speak>
    """),
    ("04-the-gap", """
        <speak>
            <break time="300ms"/>
            <prosody pitch="+1st">The problem</prosody> —
            AI can build products.
            But it <prosody pitch="+2st">can't</prosody> value them.
            It <prosody pitch="+2st">can't</prosody> split equity.
            It <prosody pitch="+2st">can't</prosody> prepare you for investors.
            <break time="300ms"/>
            <prosody rate="+5%">Manual valuation costs</prosody>
            <prosody rate="-5%" pitch="+2st">five to fifty thousand dollars</prosody>
            <prosody rate="+5%">and takes weeks.</prosody>
        </speak>
    """),
    ("05-live-demo", """
        <speak>
            <break time="500ms"/>
            <prosody rate="-5%" pitch="+2st">BlockID</prosody> changes this.
            <break time="300ms"/>
            <prosody rate="+5%">You describe your startup idea in plain text.</prosody>
            <break time="200ms"/>
            <prosody rate="+5%">Our AI analyzes it across</prosody>
            <prosody pitch="+2st">eight dimensions</prosody>
            <prosody rate="+5%">in real time.</prosody>
            <break time="300ms"/>
            <prosody rate="+5%">Market. Product. Traction. Team. Cap table. Investor readiness. Legal. Vision.</prosody>
            <break time="500ms"/>
            <prosody pitch="+2st">AI-powered valuation</prosody> in
            <prosody rate="-5%" pitch="+2st">sixty seconds.</prosody>
            From <prosody rate="-5%" pitch="+2st">Day Zero.</prosody>
        </speak>
    """),
    ("06-features", """
        <speak>
            <break time="300ms"/>
            <prosody rate="-5%" pitch="+2st">One platform.</prosody>
            <prosody rate="-5%" pitch="+2st">Entire lifecycle.</prosody>
            <break time="200ms"/>
            <prosody rate="+5%" pitch="+1st">Idea</prosody> to
            <prosody rate="+5%" pitch="+1st">MVP</prosody> to
            <prosody rate="+5%" pitch="+1st">fundraise</prosody> to
            <prosody rate="+5%" pitch="+1st">growth</prosody> to
            <prosody rate="+5%">exit.</prosody>
            <break time="300ms"/>
            <prosody rate="+5%">Evidence vault. Cap table. Milestone badges. Living report.</prosody>
            Every tool <prosody pitch="+2st">lifts your score.</prosody>
        </speak>
    """),
    ("07-market", """
        <speak>
            <break time="300ms"/>
            A <prosody rate="-5%" pitch="+2st">four-point-four trillion dollar</prosody> global startup ecosystem.
            A <prosody rate="-5%" pitch="+2st">three-point-two billion dollar</prosody> cap table market.
            <break time="300ms"/>
            <prosody rate="-5%" pitch="+2st">Twenty-six hundred</prosody> active Australian startups.
            And <prosody pitch="+2st">not one</prosody> AI-native valuation platform.
        </speak>
    """),
    ("08-dropmic", """
        <speak>
            <break time="500ms"/>
            <prosody rate="+5%">AI builds products.</prosody>
            <break time="300ms"/>
            <prosody rate="-10%" pitch="+3st">BlockID builds businesses.</prosody>
        </speak>
    """),
    ("09-cta", """
        <speak>
            <break time="300ms"/>
            <prosody rate="+5%" pitch="+1st">Try free:</prosody>
            <prosody rate="-10%" pitch="+3st">blockid dot AU.</prosody>
        </speak>
    """),
]

# =============================================================================
# 3-MINUTE PITCH — scenes derived from voiceover-3min.md
# =============================================================================
SCENES_3MIN = [
    ("01-crisis-stat", """
        <speak>
            <break time="500ms"/>
            <prosody rate="-5%" pitch="+2st">Ninety percent</prosody> of startups fail.
            <break time="400ms"/>
            <prosody rate="-5%" pitch="+2st">Three hundred and seventy thousand</prosody> Australian businesses
            <prosody pitch="+1st">closed last year.</prosody>
        </speak>
    """),
    ("02-crisis-ai", """
        <speak>
            <break time="300ms"/>
            <prosody rate="-5%" pitch="+2st">Ninety-seven billion dollars</prosody>
            <prosody pitch="+1st">in AI funding.</prosody>
            <prosody rate="-5%" pitch="+2st">Ninety percent</prosody>
            <prosody rate="+5%">still</prosody> fail.
            <break time="500ms"/>
            <prosody pitch="+1st">The gap</prosody> —
            AI builds products.
            <prosody rate="-5%" pitch="+2st">Nothing</prosody> builds businesses.
        </speak>
    """),
    ("03-founder-intro", """
        <speak>
            <break time="300ms"/>
            <prosody rate="-3%" pitch="+1st">Hi, I'm Long from BlockID dot AU.</prosody>
            <break time="200ms"/>
            I've seen founders build <prosody pitch="+2st">amazing</prosody> AI products,
            <prosody rate="+5%">then struggle to value them,</prosody>
            <prosody rate="+5%">split equity fairly,</prosody>
            <prosody rate="+5%">or get investor-ready.</prosody>
            <break time="400ms"/>
            We built the platform that <prosody pitch="+2st">fixes this</prosody>
            <prosody rate="+5%">from day one.</prosody>
        </speak>
    """),
    ("04-problem-intro", """
        <speak>
            <break time="300ms"/>
            Australian founders face <prosody rate="-5%" pitch="+2st">three critical problems.</prosody>
        </speak>
    """),
    ("05-problem1", """
        <speak>
            <break time="500ms"/>
            <prosody pitch="+2st">One</prosody> —
            <prosody rate="+5%" pitch="+1st">how much is my idea worth?</prosody>
            <break time="200ms"/>
            A manual valuation costs
            <prosody rate="-5%" pitch="+2st">five thousand to fifty thousand dollars</prosody>
            <prosody rate="+5%">and takes weeks.</prosody>
            We do it with AI <prosody pitch="+1st">in</prosody>
            <prosody rate="-5%" pitch="+2st">sixty seconds</prosody>
            from <prosody rate="-5%" pitch="+2st">one dollar.</prosody>
        </speak>
    """),
    ("06-problem2", """
        <speak>
            <break time="500ms"/>
            <prosody pitch="+2st">Two</prosody> —
            <prosody rate="+5%" pitch="+1st">how do I split equity?</prosody>
            <break time="200ms"/>
            <prosody rate="-5%" pitch="+2st">Forty-two percent</prosody> of co-founder disputes
            <prosody rate="+5%">destroy startups.</prosody>
            Our calculator makes it <prosody pitch="+2st">fair</prosody>
            and <prosody pitch="+2st">transparent.</prosody>
        </speak>
    """),
    ("07-problem3", """
        <speak>
            <break time="500ms"/>
            <prosody pitch="+2st">Three</prosody> —
            <prosody rate="+5%" pitch="+1st">how do I get investor-ready?</prosody>
            <break time="200ms"/>
            <prosody rate="+5%">Data rooms take weeks to prepare.</prosody>
            Our evidence vault <prosody pitch="+2st">auto-scores</prosody> your readiness.
        </speak>
    """),
    ("08-demo-intro", """
        <speak>
            <break time="500ms"/>
            Let me <prosody pitch="+2st">show you</prosody> how BlockID works.
            <break time="300ms"/>
            You describe your startup <prosody pitch="+1st">in plain text</prosody> —
            your idea, your team, your traction.
        </speak>
    """),
    ("09-demo-svi", """
        <speak>
            <break time="300ms"/>
            Our AI analyzes it across <prosody pitch="+2st">eight dimensions</prosody> —
            <prosody rate="+5%">market, product, traction, team,</prosody>
            <prosody rate="+5%">cap table, investor readiness, legal, and vision.</prosody>
            <break time="400ms"/>
            In under <prosody rate="-5%" pitch="+2st">sixty seconds</prosody>
            you get your <prosody rate="-5%" pitch="+2st">Startup Value Index</prosody> —
            <prosody rate="+5%">a real, evidence-backed score.</prosody>
            <break time="300ms"/>
            Plus a <prosody pitch="+2st">ten-page report</prosody>
            with market research, competitor analysis, and business model evaluation.
        </speak>
    """),
    ("10-actionable", """
        <speak>
            <break time="300ms"/>
            But we don't just give you a <prosody pitch="+2st">number.</prosody>
            <break time="300ms"/>
            <prosody pitch="+2st">Every recommendation</prosody> links directly to a tool.
            <prosody rate="+5%">Click 'Build your cap table'</prosody> and the equity calculator <prosody pitch="+2st">opens.</prosody>
            <break time="200ms"/>
            Set your founder split, co-founder allocation, and ESOP pool.
            <prosody rate="+5%">The moment you complete it,</prosody> your SVI <prosody pitch="+2st">auto-rescores.</prosody>
            <break time="400ms"/>
            <prosody rate="-5%" pitch="+2st">One thirty-eight</prosody> becomes
            <prosody rate="-5%" pitch="+2st">one forty-six.</prosody>
            <prosody pitch="+2st">Eight points gained</prosody>
            <prosody rate="+5%">just by getting your cap table right.</prosody>
        </speak>
    """),
    ("11-evidence", """
        <speak>
            <break time="300ms"/>
            Every claim needs <prosody pitch="+2st">proof.</prosody>
            <prosody rate="+5%">Our Evidence Vault lets you upload pitch decks,</prosody>
            <prosody rate="+5%">connect GitHub,</prosody>
            <prosody rate="+5%">verify revenue through Stripe.</prosody>
            <break time="300ms"/>
            Each piece of evidence <prosody pitch="+1st">lifts your score</prosody> —
            <prosody rate="+5%">from twenty percent confidence</prosody> to
            <prosody rate="-5%" pitch="+2st">ninety percent verified.</prosody>
            <break time="300ms"/>
            Your startup's value <prosody pitch="+2st">grows with you.</prosody>
            <prosody rate="+5%">Stripe for revenue data.</prosody>
            <prosody rate="+5%">GitHub for code activity.</prosody>
            <prosody rate="+5%">Pitch decks for investor readiness.</prosody>
            <prosody rate="+5%">Milestones for badge progress.</prosody>
        </speak>
    """),
    ("12-roadmap", """
        <speak>
            <break time="500ms"/>
            But we're <prosody pitch="+2st">just getting started.</prosody>
            <break time="300ms"/>
            <prosody rate="+5%">Phase one, AI analysis</prosody> — that's <prosody pitch="+2st">live today.</prosody>
            <prosody rate="+5%">Phase two,</prosody> evidence and validation.
            <prosody rate="+5%">Phase three,</prosody> <prosody pitch="+2st">dollar valuation engine.</prosody>
            <prosody rate="+5%">Phase four,</prosody> full cap table management.
            <break time="300ms"/>
            Then <prosody rate="+5%">blockchain tokenization,</prosody>
            <prosody rate="+5%">investor matching,</prosody>
            <prosody rate="+5%">revenue tracking,</prosody>
            <prosody rate="+5%">and exit planning.</prosody>
            <break time="400ms"/>
            From <prosody pitch="+2st">idea</prosody> to <prosody pitch="+2st">IPO</prosody> —
            <prosody rate="-5%" pitch="+2st">one platform.</prosody>
            <prosody rate="+5%">Validate, build, prove, raise, and scale.</prosody>
        </speak>
    """),
    ("13-market", """
        <speak>
            <break time="300ms"/>
            Australia has <prosody rate="-5%" pitch="+2st">six hundred thousand</prosody> private companies.
            <prosody rate="-5%" pitch="+2st">Fifty thousand</prosody> raise capital every year.
            <prosody rate="-5%" pitch="+2st">Twenty-six hundred</prosody> active startups.
            <prosody rate="-5%" pitch="+2st">Fifteen thousand</prosody> angel investors.
            <break time="300ms"/>
            That's a <prosody rate="-5%" pitch="+2st">three-point-two billion dollar</prosody>
            addressable market
            <prosody rate="+5%">in cap table and valuation tools alone.</prosody>
        </speak>
    """),
    ("14-pricing", """
        <speak>
            <break time="300ms"/>
            <prosody pitch="+1st">Our pricing</prosody> —
            <prosody rate="+5%">first analysis</prosody> <prosody pitch="+2st">free.</prosody>
            Then <prosody pitch="+2st">one dollar</prosody> per report.
            <prosody rate="+5%">Founding fifty at</prosody> <prosody pitch="+2st">forty-nine dollars</prosody> for lifetime access.
            Growth plan at <prosody pitch="+2st">ninety-nine dollars</prosody> a month.
            <break time="200ms"/>
            <prosody rate="+5%">Gross margins sit between</prosody>
            <prosody rate="-5%" pitch="+2st">eighty-eight and ninety-nine percent.</prosody>
            <prosody rate="+5%">AI costs under five dollars a day.</prosody>
        </speak>
    """),
    ("15-competitors", """
        <speak>
            <break time="300ms"/>
            Unlike <prosody rate="+5%">Carta, Pulley, or Qapita</prosody> —
            <prosody rate="-5%" pitch="+2st">BlockID</prosody> is built specifically for
            <prosody pitch="+2st">Australian founders.</prosody>
            <break time="300ms"/>
            <prosody rate="+5%" pitch="+1st">AI valuation?</prosody> <prosody rate="-5%" pitch="+2st">Only us.</prosody>
            <prosody rate="+5%" pitch="+1st">AU-native compliance?</prosody> <prosody rate="-5%" pitch="+2st">Only us.</prosody>
            <prosody rate="+5%" pitch="+1st">Day zero to exit?</prosody> <prosody rate="-5%" pitch="+2st">Only us.</prosody>
            <prosody rate="+5%" pitch="+1st">Starting from one dollar?</prosody> <prosody rate="-5%" pitch="+2st">Only us.</prosody>
            <prosody rate="+5%" pitch="+1st">Blockchain equity?</prosody> <prosody rate="-5%" pitch="+3st">Only us.</prosody>
            <break time="300ms"/>
            <prosody rate="+5%">A B N, A S I C, E S I C, R and D tax</prosody> —
            <prosody rate="-5%" pitch="+2st">all baked in.</prosody>
            <prosody rate="+5%">Not an afterthought.</prosody>
        </speak>
    """),
    ("16-team", """
        <speak>
            <break time="300ms"/>
            We're a <prosody rate="-5%" pitch="+2st">lean, AI-first team.</prosody>
            One founder <prosody pitch="+1st">plus</prosody>
            <prosody rate="-5%" pitch="+2st">nine AI agents</prosody> —
            <prosody rate="+10%">CTO, CPO, CMO, CFO, COO, CRO,
            investor relations, media studio, and blockchain.</prosody>
            <break time="300ms"/>
            <prosody rate="-5%" pitch="+2st">Fifty-four</prosody> specialized skills.
            Built the full platform in <prosody rate="-5%" pitch="+2st">nineteen days.</prosody>
            <prosody rate="-5%" pitch="+2st">Two hundred and seventy-two</prosody> TypeScript files.
            <prosody rate="-5%" pitch="+2st">Seventy</prosody> API routes.
            <prosody rate="-5%" pitch="+2st">Forty-one</prosody> database tables.
            <break time="200ms"/>
            <prosody rate="+5%">Every feature ships in hours,</prosody>
            <prosody rate="-5%" pitch="+2st">not months.</prosody>
            <break time="300ms"/>
            And we're built for <prosody pitch="+2st">Australian compliance.</prosody>
            <prosody rate="+5%">ASIC registration. ESIC tax incentives. R and D tax offset. AU data residency.</prosody>
        </speak>
    """),
    ("17-dropmic", """
        <speak>
            <break time="500ms"/>
            <prosody rate="-5%" pitch="+2st">Two hundred and fifty-two billion dollars</prosody>
            invested in AI last year.
            <break time="300ms"/>
            <prosody rate="-5%" pitch="+2st">Ninety percent</prosody> of those startups will fail.
            <break time="300ms"/>
            <prosody rate="+5%">Not because of bad ideas.</prosody>
            <break time="300ms"/>
            Because <prosody rate="-5%" pitch="+2st">nobody</prosody> helped them prove their value.
            <break time="500ms"/>
            <prosody rate="-15%" pitch="+3st">Until now.</prosody>
        </speak>
    """),
    ("18-cta", """
        <speak>
            <break time="300ms"/>
            Get your <prosody pitch="+2st">free</prosody> SVI analysis
            <prosody pitch="+1st">at</prosody>
            <prosody rate="-10%" pitch="+3st">blockid dot AU.</prosody>
            <break time="200ms"/>
            <prosody rate="+5%" pitch="+1st">Build it right.</prosody>
            <prosody rate="+5%" pitch="+1st">Build it valuable.</prosody>
            <prosody rate="-10%" pitch="+3st">Build it with BlockID.</prosody>
        </speak>
    """),
]


async def generate_scene(voice, text, outpath):
    """Generate audio for one scene using SSML."""
    comm = edge_tts.Communicate(text, voice)
    await comm.save(outpath)


async def main():
    os.makedirs(OUT_1MIN, exist_ok=True)
    os.makedirs(OUT_3MIN, exist_ok=True)

    print("=== Generating 1-minute pitch audio ===")
    for name, ssml in SCENES_1MIN:
        path = f"{OUT_1MIN}/{name}.mp3"
        print(f"  Generating {name}...", end=" ", flush=True)
        try:
            await generate_scene(VOICE, ssml, path)
            size = os.path.getsize(path)
            print(f"OK ({size:,} bytes)")
        except Exception as e:
            print(f"FAIL: {e}")

    print(f"\n=== Generating 3-minute pitch audio ===")
    for name, ssml in SCENES_3MIN:
        path = f"{OUT_3MIN}/{name}.mp3"
        print(f"  Generating {name}...", end=" ", flush=True)
        try:
            await generate_scene(VOICE, ssml, path)
            size = os.path.getsize(path)
            print(f"OK ({size:,} bytes)")
        except Exception as e:
            print(f"FAIL: {e}")

    # Merge all scenes into single files
    print("\n=== Merging audio files ===")
    merged_dir = "/home/dovanlong/blockid.au/web/public/video-assets/audio"
    for label, outdir, filename in [
        ("1min", OUT_1MIN, "blockid_pitch1min_voiceover.mp3"),
        ("3min", OUT_3MIN, "blockid_pitch_3mins_voiceover.mp3"),
    ]:
        files = sorted([f for f in os.listdir(outdir) if f.endswith(".mp3")])
        if not files:
            print(f"  No files found for {label}, skipping merge.")
            continue

        listfile = f"{outdir}/filelist.txt"
        with open(listfile, "w") as fh:
            for f in files:
                fh.write(f"file '{f}'\n")

        merged = f"{merged_dir}/{filename}"
        result = subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", listfile, "-c", "copy", merged],
            capture_output=True,
            text=True,
            cwd=outdir,
        )
        if result.returncode == 0:
            size = os.path.getsize(merged)
            print(f"  Merged {label}: {merged} ({size:,} bytes)")
        else:
            print(f"  Merge FAILED for {label}: {result.stderr}")

    # Print summary
    print("\n=== Summary ===")
    for label, outdir in [("1min-new", OUT_1MIN), ("3min-new", OUT_3MIN)]:
        files = sorted([f for f in os.listdir(outdir) if f.endswith(".mp3")])
        total = sum(os.path.getsize(f"{outdir}/{f}") for f in files)
        print(f"  {label}: {len(files)} scene files, {total:,} bytes total")

    for filename in ["blockid_pitch1min_voiceover.mp3", "blockid_pitch_3mins_voiceover.mp3"]:
        path = f"{merged_dir}/{filename}"
        if os.path.exists(path):
            size = os.path.getsize(path)
            print(f"  {filename}: {size:,} bytes")

    print("\nDone!")


asyncio.run(main())
