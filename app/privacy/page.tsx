import { pageMetadata } from "@/lib/site-metadata";
import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/LegalDocument";

export const metadata: Metadata = pageMetadata("/privacy", "How Arctos Bot collects, uses, shares, and protects information.");

const sections: LegalSection[] = [
  { title: "About this policy", paragraphs: ["This Privacy Policy explains how Arctos Bot collects, uses, shares, and protects information when you visit the Arctos Bot website, connect an X account, use an Arctos Bot wallet, submit commands, or otherwise use our services.", "Questions or privacy requests may be sent to Arctos Bot support."] },
  { title: "Information we collect", bullets: ["X account information needed to authenticate you, receive commands, and provide responses.", "Public wallet and blockchain information, including addresses, balances, transaction hashes, token activity, and fee activity.", "Content you provide, including X posts, wallet requests, token details, images, links, wallet destinations, and support messages."] },
  { title: "How we use information", bullets: ["Provide wallets and carry out the actions you request.", "Display wallet, token, transaction, fee, and liquidity information.", "Authenticate sessions, prevent abuse, secure the service, diagnose failures, and improve reliability.", "Respond to support requests and comply with legal obligations."] },
  { title: "Public blockchain information", paragraphs: ["Blockchain networks are public. Wallet addresses, transactions, token activity, smart-contract interactions, and related records may remain permanently visible through block explorers, nodes, indexers, and other independent services. Arctos Bot cannot alter or delete information recorded on a public blockchain."] },
  { title: "How information is shared", paragraphs: ["Arctos Bot does not sell personal information. Information may be provided to infrastructure and service providers where needed to operate the service, process your instructions, prevent abuse, or comply with law."], bullets: ["X and authentication providers.", "Wallet infrastructure, blockchain networks, RPC providers, smart contracts, and block explorers.", "Hosting, database, security, analytics, AI, market-data, market-data providers."] },
  { title: "Third-party services", paragraphs: ["Features may interact with independent services such as X, Coinbase Developer Platform, Arc, CoinGecko, GeckoTerminal, Blockscout, and other wallet, market-data, or blockchain providers. Their own terms and privacy practices apply to information they process."] },
];

export default function PrivacyPage() { return <LegalDocument eyebrow="Arctos Bot legal" title="Privacy Policy" summary="How Arctos Bot handles information across its website, X features, wallets, and related services." sections={sections} />; }
