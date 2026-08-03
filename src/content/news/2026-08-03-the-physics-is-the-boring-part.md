---
title: Quantum could crack 2.3m Bitcoin — but the real threat is Bitcoin
slug: the-physics-is-the-boring-part
date: 2026-08-03T00:00:00.000Z
word_count: 1192
tags:
  - bitcoin
  - quantum
  - cryptography
  - security
  - blockchain
category: news
edited_at: '2026-08-03T12:25:59.955Z'
editor_notes: Fixed 2 over-explanations
original_title: The Physics Is the Boring Part
standfirst: >-
  A June 2026 study finds 2.3 million BTC are 'irreducibly at risk' from a
  future quantum computer. But the harder problem is what Bitcoin does about it
  — every fix breaks a rule the currency was built on.
social_post: >-
  The quantum computer that could drain Bitcoin doesn't exist yet — and that's
  the problem. When it does, 2.3m coins are exposed. Freeze them and you kill
  decentralisation; do nothing and you greenlight the biggest heist in history.
  Which betrayal does Bitcoin choose?
packaged_at: '2026-08-03T12:25:39.515Z'
editorial_score:
  newsworthiness: 6
  traction: 7
  complexity: 8
  uniqueness: 7
  average: 7
quality_score:
  prose_voice: 8
  structure: 8
  clarity: 9
  originality: 8
  sourcing: 8
  fairness: 7
  overall: 8
  tier: Strong
  rationale:
    prose_voice: >-
      Punchy, distinctive voice with vivid controlled metaphors; only two mild
      over-explanation flags drag it from a 9.
    structure: >-
      Strong 'heist that hasn't happened' lead, clean nut graf, thematic
      non-formulaic headers, and an ending that lands hard.
    clarity: >-
      Logical-vs-physical qubits, Shor-vs-Grover, and 'monitor now, attack
      later' all made lucid without dumbing down.
    originality: >-
      Reframes source's 'governance harder than physics' into a compelling
      political/civil-war frame rather than reworded tech summary.
    sourcing: >-
      Claims tied to named sources (arXiv paper, Google Quantum AI, NIST, vendor
      roadmaps); 14/14 fact-checked, no removals.
    fairness: >-
      Balances reassuring and alarming sides, but some editorial flourishes
      ('grown-ups', 'religion arguing over scripture') tip toward unearned
      coloring.
  scored_at: '2026-08-03T12:25:59.955Z'
hero_image: /images/articles/the-physics-is-the-boring-part.png
hero_image_concept: >-
  A lone cryptographer hunched at a cluttered desk in a cold basement lab,
  staring up at a hanging chandelier-like quantum computer — a tiered golden
  cylinder of coiled wires and plates suspended from the ceiling above him. On
  the desk sits a heavy metal vault door lying flat, its combination dial
  stamped with the Bitcoin ₿ symbol, hairline-cracked open. Cables, mugs,
  printed papers and frost on the pipes fill the room.
status: published
approved_at: '2026-08-03T13:04:21.242Z'
---

**The Heist That Hasn't Happened Yet**

The most dangerous thing about the quantum computer that could drain Bitcoin is that it doesn't exist. Not yet. And by the time it does, the argument about what to do with it will already have torn the place apart.

Bitcoin transactions are authorised by a piece of maths called ECDSA over secp256k1 — elliptic-curve cryptography, which for most of Bitcoin's history has been the lock on the vault. A private key signs, the network checks, the coins move. Today no machine on Earth can pick that lock. Shor's algorithm, run on a fault-tolerant quantum computer, could — reconstructing your private key from a public key that has already been shown to the world. That "not yet" is the entire comfort blanket.

Here's the catch. A quantum attacker can't derive your key from a Bitcoin address alone. It only works once the public key is visible on the blockchain, which happens with reused addresses, older wallet formats, and coins left dormant. A June 2026 arXiv paper, titled plainly *An evaluation of quantum computing as a threat to Bitcoin and Ethereum*, counts roughly six million exposed coins, of which about 2.3 million BTC are "irreducibly at risk." Out of a supply capped at 21 million. Do the sum: more than one coin in ten sits in a house with the door already ajar.

## The Physics Is the Boring Part

Everyone fixates on the qubit count, as though the danger were a countdown timer bolted to a machine. But the paper says the quiet part out loud: the real bottleneck is not technology, it's governance and migration speed. Which means the true threat to Bitcoin isn't a lab in California. It's Bitcoin.

Consider the fork nobody wants to look at. A chunk of those 2.3 million coins belong to people who are dead, who lost their keys, or who simply vanished. When the crack becomes real, the community has three options, and every one betrays something Bitcoin claims to hold sacred. Freeze the exposed coins, and you've admitted a central authority can reach into wallets — the exact power Bitcoin was built to abolish. Seize or redistribute them, worse. Do nothing, and you're rolling out the red carpet for the largest theft in history and calling it principle. This is a religion arguing over whether it's allowed to touch its own scripture. And markets, being markets, will not wait for the synod to finish.

## The Burglar and the Guy on a Bicycle

Now the fun part: making the machine make sense.

Two algorithms threaten the padlock, and they differ wildly in menace. Grover's algorithm is the one people fret about for mining. Relax. It offers only a quadratic speedup — turn a million-step task into a thousand-ish steps, not one step. That sounds terrifying until you remember Bitcoin's difficulty adjusts, mining can't be parallelised forever, and running these machines carries brutal overhead. Grover is a man with a slightly faster bicycle entering a race against a fleet of trucks.

Shor's algorithm is the actual burglar. It doesn't shave time off the lock; it dissolves it. Give it an exposed public key and it hands back the private one. That's the whole game.

The counterintuitive bit is that you don't need a "big" quantum computer the way you'd picture one. In March 2026, Google Quantum AI published new estimates that made a lot of people spill their coffee. They said the elliptic-curve problem sitting under most cryptocurrencies — ECDLP-256 — could be cracked by a Shor circuit using under 1,200 logical qubits and 90 million Toffoli gates, or in another configuration under 1,450 logical qubits and 70 million gates. On a superconducting machine, that means fewer than 500,000 physical qubits, running in minutes. Google called it roughly a 20x cut in the physical qubits previously thought necessary.

That word "logical" matters. A physical qubit is a real, twitchy, error-prone thing. A logical qubit is a reliable one you build by ganging many physical qubits together so their mistakes cancel out. Breaking cryptography needs error-corrected logical qubits performing lots of dependable operations in a row — not just a big heap of raw physical ones. Which is why "we have X qubits!" headlines mean almost nothing on their own.

So who's building the burglar? Everyone, using different blueprints. IBM's roadmap points to a fault-tolerant machine called Starling in 2029 — 200 qubits, 100 million gates — with a larger Blue Jay after 2033. IonQ, using trapped ions, aims to go from around 12 logical qubits in 2026 to 80,000 by 2030. PsiQuantum is chasing a million-qubit photonic machine. Quantinuum is a credible trapped-ion contender. Microsoft's approach has always been harder to grade cleanly, which is a polite way of saying nobody's sure. Each path has a tragic flaw: superconducting is fast but drowning in error correction, trapped ions are precise but hard to scale, photonics might scale but the engineering is savage.

The odds, per that June paper: about a 1-in-6 chance of a cryptographically relevant machine by 2035, 30% by 2040, 60% by 2050. Not tomorrow. But not never — and "never" was the quiet assumption the whole system was built on.

Then the nastiest wrinkle. For ordinary encrypted data, the fear is "store now, decrypt later" — hoover up secrets today, read them when the machine arrives. Bitcoin's version is "monitor now, attack later." The exposed keys already sit on the public ledger. The loot is already in the shop window. The thief is only waiting on tools.

The grown-ups have started moving. NIST finalised its first post-quantum standards in 2024 — ML-KEM for key exchange, ML-DSA and SLH-DSA for signatures — and says to begin migrating now, with vulnerable algorithms deprecated by 2035. Google got spooked enough by its own research to bring its internal deadline forward to 2029. The fixes exist. And Bitcoin isn't even the hardest case: on Ethereum, 50 to 65% of Ether sits in accounts that could adopt post-quantum signatures. Any asset built on elliptic-curve signatures carries the same disease. In the shorter term, the boring advice actually works — stop reusing addresses, minimise public-key exposure, abandon older wallet patterns, find your vulnerable dormant holdings, and plan the upgrade before you need it.

## What You Should Actually Fear

Bitcoin's quantum problem is not, at its heart, a cryptography problem. Cryptographers have already written the cure and a standards body has stamped it. It's a political problem wearing a lab coat. The technology to save the coins exists; the willingness to make one collective decision about 2.3 million of them does not.

And markets don't price physics. They price fear. Long before a single working attack machine hums to life, the mere credible rumour that Bitcoin must choose between freezing dead men's fortunes and watching them looted will do the damage all by itself. The quantum computer is a maybe. The civil war over what counts as sacred property is a certainty. The only open question is whether they hold the vote before the panic or after it — and Bitcoin has never once in its life been early to anything.
