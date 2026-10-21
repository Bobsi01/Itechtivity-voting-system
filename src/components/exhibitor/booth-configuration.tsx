"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Building2,
  Lock,
  MapPin,
  Users,
  UserPlus,
  Save,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { VenueFloorMap } from "@/components/public/venue-floor-map";

export interface BoothProfile {
  id: string;
  code: string;
  projectTitle: string;
  description: string | null;
  websiteUrl: string | null;
  coverUrl: string | null;
  mapSlot: string | null;
  capstoneCategory: string;
  programCode: string | null;
  teamMembers: string | null;
  tableNumber: string | null;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoExhibitorMember {
  id: string;
  email: string;
  fullName: string;
  role: string;
  boothId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function BoothConfiguration() {

  const [booth, setBooth] = useState<BoothProfile | null>(null);
  const [members, setMembers] = useState<CoExhibitorMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingMember, setIsCreatingMember] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State for Booth Metadata
  const [projectTitle, setProjectTitle] = useState("");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [teamMembers, setTeamMembers] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");

  // Form State for Co-Exhibitor Creation
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberPassword, setNewMemberPassword] = useState("");

  const loadBoothData = useCallback(async () => {

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [boothRes, membersRes] = await Promise.all([
        fetch("/api/exhibitor/booth"),
        fetch("/api/exhibitor/members"),
      ]);

      const boothData = await boothRes.json();
      const membersData = await membersRes.json();

      if (boothRes.ok && boothData.success && boothData.booth) {
        const b = boothData.booth as BoothProfile;
        setBooth(b);
        setProjectTitle(b.projectTitle || "");
        setDescription(b.description || "");
        setWebsiteUrl(b.websiteUrl || "");
        setTeamMembers(b.teamMembers || "");
        setLogoUrl(b.logoUrl || "");
        setCoverUrl(b.coverUrl || "");
      } else {
        setErrorMessage(boothData.message || boothData.error || "Failed to load booth details.");
      }

      if (membersRes.ok && membersData.success && Array.isArray(membersData.members)) {
        setMembers(membersData.members);
      }
    } catch {
      setErrorMessage("Network error occurred while loading booth details.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoothData();
  }, [loadBoothData]);

  const handleSaveMetadata = async (e: React.FormEvent<HTMLFormElement>) => {

    e.preventDefault();
    if (!projectTitle.trim()) {
      toast.error("Project title is required.");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/exhibitor/booth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectTitle: projectTitle.trim(),
          description: description.trim() || null,
          websiteUrl: websiteUrl.trim() || null,
          teamMembers: teamMembers.trim() || null,
          logoUrl: logoUrl.trim() || null,
          coverUrl: coverUrl.trim() || null,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.booth) {
        setBooth(data.booth);
        toast.success("Booth configuration updated successfully.");
      } else {
        toast.error(data.message || data.error || "Failed to update booth.");
      }
    } catch {
      toast.error("Network error occurred while saving booth configuration.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateMember = async (e: React.FormEvent<HTMLFormElement>) => {

    e.preventDefault();
    if (!newMemberEmail.trim() || !newMemberName.trim() || !newMemberPassword) {
      toast.error("All co-exhibitor fields are required.");
      return;
    }

    if (newMemberPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    setIsCreatingMember(true);
    try {
      const res = await fetch("/api/exhibitor/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newMemberEmail.trim().toLowerCase(),
          fullName: newMemberName.trim(),
          password: newMemberPassword,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.member) {
        setMembers((prev) => [...prev, data.member]);
        setNewMemberEmail("");
        setNewMemberName("");
        setNewMemberPassword("");
        toast.success(`Co-exhibitor account created for ${data.member.email}.`);
      } else {
        toast.error(data.message || data.error || "Failed to create co-exhibitor.");
      }
    } catch {
      toast.error("Network error occurred while creating co-exhibitor account.");
    } finally {
      setIsCreatingMember(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 space-y-4">
        <RefreshCw className="w-6 h-6 animate-spin text-neutral-800" />
        <p className="text-sm font-mono text-neutral-600">Loading booth configuration and team roster...</p>
      </div>
    );
  }

  if (errorMessage || !booth) {
    return (
      <div className="border border-neutral-300 rounded-lg p-6 space-y-4 text-center max-w-lg mx-auto">
        <AlertCircle className="w-8 h-8 text-neutral-800 mx-auto" />
        <div className="space-y-1">
          <h2 className="text-base font-bold text-neutral-900">Unable to Load Booth</h2>
          <p className="text-xs font-mono text-neutral-600">{errorMessage || "Booth information is not available."}</p>
        </div>
        <button
          type="button"
          onClick={loadBoothData}
          className="min-h-[44px] px-4 py-2 border border-neutral-900 text-xs font-bold uppercase tracking-wider rounded text-neutral-900 hover:border-neutral-700 transition-colors inline-flex items-center gap-2 touch-manipulation select-none"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Retry Loading</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-md lg:max-w-4xl mx-auto pb-12">
      {/* Read-Only Parameters Sub-Card */}
      <section
        aria-labelledby="readonly-params-heading"
        className="border border-neutral-300 rounded-lg p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-neutral-700 flex-shrink-0" />
            <h2 id="readonly-params-heading" className="text-xs font-bold uppercase tracking-wider text-neutral-900">
              Assigned Parameters (Admin-Governed)
            </h2>
          </div>
          <span className="text-[10px] font-mono border border-neutral-300 px-2 py-0.5 rounded text-neutral-600">
            Read-Only
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
          {/* Booth Code */}
          <div className="border border-neutral-200 p-2.5 rounded space-y-1">
            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider block">
              Booth Code
            </span>
            <span className="font-mono text-sm font-bold text-neutral-900 block truncate">
              {booth.code}
            </span>
          </div>

          {/* Map Slot with Visual Badge */}
          <div className="border border-neutral-200 p-2.5 rounded space-y-1">
            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider block">
              Floor Map Slot
            </span>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-neutral-700 flex-shrink-0" />
              <span className="font-mono text-xs font-bold border border-neutral-900 px-1.5 py-0.5 rounded text-neutral-900">
                {booth.mapSlot || "Unassigned"}
              </span>
            </div>
          </div>

          {/* Table Assignment */}
          <div className="border border-neutral-200 p-2.5 rounded space-y-1">
            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider block">
              Table Number
            </span>
            <span className="font-mono text-xs font-semibold text-neutral-800 block truncate">
              {booth.tableNumber || "Unassigned"}
            </span>
          </div>

          {/* Degree Program */}
          <div className="border border-neutral-200 p-2.5 rounded space-y-1">
            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider block">
              Academic Program
            </span>
            <span className="font-mono text-xs font-semibold text-neutral-800 block truncate">
              {booth.programCode || "General CSD"}
            </span>
          </div>

          {/* Capstone Category */}
          <div className="border border-neutral-200 p-2.5 rounded space-y-1 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider block">
              Award Category
            </span>
            <span className="font-mono text-xs font-semibold text-neutral-800 block truncate">
              {booth.capstoneCategory}
            </span>
          </div>
        </div>

        <p className="text-[11px] font-mono text-neutral-500">
          Note: Floor slot, booth code, table assignment, and award category can only be changed by event administrators.
        </p>
      </section>

      {/* Floor Map Assigned Location Preview */}
      <section
        aria-labelledby="floormap-preview-heading"
        className="border border-neutral-300 rounded-lg p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-neutral-700 flex-shrink-0" />
            <h2 id="floormap-preview-heading" className="text-xs font-bold uppercase tracking-wider text-neutral-900">
              Assigned Venue Floor Location
            </h2>
          </div>
          <span className="text-[10px] font-mono border border-neutral-300 px-2 py-0.5 rounded text-neutral-600">
            {booth.mapSlot ? `Slot ${booth.mapSlot}` : "Unassigned"}
          </span>
        </div>

        <p className="text-xs font-mono text-neutral-600">
          {booth.mapSlot
            ? `Your booth is assigned to slot ${booth.mapSlot}. Below is your location on the 40-box exhibition hall map.`
            : "No floor map slot has been assigned to your booth yet. Please contact event administrators to reserve a floor location."}
        </p>

        <VenueFloorMap
          booths={
            booth.mapSlot
              ? [
                  {
                    code: booth.code,
                    projectTitle: booth.projectTitle,
                    mapSlot: booth.mapSlot,
                    tableNumber: booth.tableNumber,
                    capstoneCategory: booth.capstoneCategory,
                  },
                ]
              : []
          }
          mode="exhibitor-preview"
          highlightedSlot={booth.mapSlot}
        />
      </section>

      {/* Editable Metadata Form Card */}
      <section
        aria-labelledby="booth-metadata-heading"
        className="border border-neutral-300 rounded-lg p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-neutral-700 flex-shrink-0" />
            <h2 id="booth-metadata-heading" className="text-xs font-bold uppercase tracking-wider text-neutral-900">
              Capstone Showcase Profile
            </h2>
          </div>
          <span className="text-[10px] font-mono border border-neutral-300 px-2 py-0.5 rounded text-neutral-600">
            Self-Service
          </span>
        </div>

        <form onSubmit={handleSaveMetadata} className="space-y-4 text-xs">
          {/* Project Title */}
          <div className="space-y-1.5">
            <label htmlFor="booth-project-title" className="font-bold text-neutral-800 block">
              Project Title <span className="text-neutral-500">*</span>
            </label>
            <input
              id="booth-project-title"
              type="text"
              required
              minLength={2}
              maxLength={160}
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              placeholder="e.g. AgriSense: Autonomous Crop Analytics"
              className="w-full px-3 py-2.5 font-mono text-base border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px]"
            />
            <p className="text-[11px] font-mono text-neutral-500">
              Official title displayed on public showcase listings and voting certificates.
            </p>
          </div>

          {/* Description / Synopsis */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="booth-description" className="font-bold text-neutral-800">
                Capstone Synopsis / Description
              </label>
              <span className="font-mono text-[10px] text-neutral-500">
                {description.length} / 1000
              </span>
            </div>
            <textarea
              id="booth-description"
              rows={4}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide a concise summary of the project problem, methodology, and key features..."
              className="w-full px-3 py-2.5 font-mono text-base border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[100px]"
            />
          </div>

          {/* Website / Portfolio Link */}
          <div className="space-y-1.5">
            <label htmlFor="booth-website-url" className="font-bold text-neutral-800 block">
              External Portfolio / Live Demonstration URL
            </label>
            <div className="relative">
              <input
                id="booth-website-url"
                type="url"
                maxLength={500}
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://example.com/project"
                className="w-full pl-3 pr-10 py-2.5 font-mono text-base border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px]"
              />
              {websiteUrl.trim() && (
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-neutral-600 hover:text-neutral-900 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Open portfolio URL in new tab"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>

          {/* Team Members Roster Display */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="booth-team-members" className="font-bold text-neutral-800">
                Team Members Roster (Showcase Display)
              </label>
              <span className="font-mono text-[10px] text-neutral-500">
                {teamMembers.length} / 300
              </span>
            </div>
            <input
              id="booth-team-members"
              type="text"
              maxLength={300}
              value={teamMembers}
              onChange={(e) => setTeamMembers(e.target.value)}
              placeholder="e.g. Juan Dela Cruz, Maria Santos, Pedro Penduko"
              className="w-full px-3 py-2.5 font-mono text-base border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px]"
            />
            <p className="text-[11px] font-mono text-neutral-500">
              Formatted author list shown to attendees. To grant teammates login access to scan, use the Co-Exhibitors section below.
            </p>
          </div>

          {/* Logo & Cover URLs Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Logo Image URL */}
            <div className="space-y-1.5">
              <label htmlFor="booth-logo-url" className="font-bold text-neutral-800 block">
                Booth Logo Image URL
              </label>
              <input
                id="booth-logo-url"
                type="text"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://... or data:image/png;base64,..."
                className="w-full px-3 py-2.5 font-mono text-base border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px]"
              />
              {logoUrl.trim() && (
                <div className="border border-neutral-200 rounded p-2 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoUrl}
                    alt="Logo preview"
                    className="w-8 h-8 object-contain rounded border border-neutral-300"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                  <span className="font-mono text-[10px] text-neutral-600 truncate">Logo preview active</span>
                </div>
              )}
            </div>

            {/* Cover Banner URL */}
            <div className="space-y-1.5">
              <label htmlFor="booth-cover-url" className="font-bold text-neutral-800 block">
                Showcase Cover Photo Banner URL
              </label>
              <input
                id="booth-cover-url"
                type="text"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="https://... or data:image/jpeg;base64,..."
                className="w-full px-3 py-2.5 font-mono text-base border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px]"
              />
              {coverUrl.trim() && (
                <div className="border border-neutral-200 rounded p-2 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-neutral-600 flex-shrink-0" />
                  <span className="font-mono text-[10px] text-neutral-600 truncate">Cover banner configured</span>
                </div>
              )}
            </div>
          </div>

          {/* Submit Action Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 border border-neutral-900 hover:border-neutral-700 text-xs font-bold uppercase tracking-wider rounded text-neutral-900 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50 touch-manipulation select-none"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving Configuration...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Booth Configuration</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* Co-Exhibitor Team Management Sub-Card */}
      <section
        aria-labelledby="coexhibitor-heading"
        className="border border-neutral-300 rounded-lg p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-neutral-700 flex-shrink-0" />
            <div>
              <h2 id="coexhibitor-heading" className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                Co-Exhibitor Scanner Accounts
              </h2>
              <p className="text-[11px] font-mono text-neutral-500">
                Accounts authorized to sign in and scan ticket stubs for Booth {booth.code}
              </p>
            </div>
          </div>
          <span className="font-mono text-xs font-bold border border-neutral-300 px-2 py-0.5 rounded text-neutral-800">
            {members.length} {members.length === 1 ? "Member" : "Members"}
          </span>
        </div>

        {/* Members Roster List */}
        <div className="space-y-2">
          {members.length === 0 ? (
            <div className="border border-neutral-200 border-dashed rounded p-4 text-center text-xs font-mono text-neutral-600">
              No co-exhibitor user accounts have been added yet. Use the form below to create accounts for your teammates.
            </div>
          ) : (
            <div className="border border-neutral-200 rounded divide-y divide-neutral-200 overflow-hidden">
              {members.map((member) => (
                <div key={member.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 space-y-0.5">
                    <span className="font-bold text-neutral-900 block truncate">
                      {member.fullName}
                    </span>
                    <span className="font-mono text-neutral-600 block truncate">
                      {member.email}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 text-right">
                    <span className="font-mono text-[10px] border border-neutral-300 px-1.5 py-0.5 rounded text-neutral-600">
                      {member.role}
                    </span>
                    <span className="font-mono text-[10px] text-neutral-400 hidden sm:inline">
                      {new Date(member.createdAt).toLocaleDateString([], { month: "short", day: "2-digit" })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add New Co-Exhibitor Form */}
        <form onSubmit={handleCreateMember} className="border-t border-neutral-200 pt-4 space-y-3 text-xs">
          <div className="flex items-center gap-1.5 text-neutral-800 font-bold uppercase tracking-wider text-[11px]">
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add New Co-Exhibitor Account</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Full Name */}
            <div className="space-y-1">
              <label htmlFor="member-fullname" className="font-semibold text-neutral-800 block">
                Full Name <span className="text-neutral-500">*</span>
              </label>
              <input
                id="member-fullname"
                type="text"
                required
                minLength={2}
                maxLength={100}
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                placeholder="Maria Santos"
                className="w-full px-3 py-2 font-mono text-base border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px]"
              />
            </div>

            {/* Email */}
            <div className="space-y-1">
              <label htmlFor="member-email" className="font-semibold text-neutral-800 block">
                Institutional Email <span className="text-neutral-500">*</span>
              </label>
              <input
                id="member-email"
                type="email"
                required
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
                placeholder="santos.m@ucc.edu.ph"
                className="w-full px-3 py-2 font-mono text-base border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px]"
              />
            </div>

            {/* Initial Password */}
            <div className="space-y-1">
              <label htmlFor="member-password" className="font-semibold text-neutral-800 block">
                Initial Password <span className="text-neutral-500">*</span>
              </label>
              <input
                id="member-password"
                type="password"
                required
                minLength={6}
                maxLength={100}
                value={newMemberPassword}
                onChange={(e) => setNewMemberPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full px-3 py-2 font-mono text-base border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px]"
              />
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between gap-3">
            <p className="text-[11px] font-mono text-neutral-500">
              The teammate will be immediately bound to Booth {booth.code} with scanner permissions.
            </p>
            <button
              type="submit"
              disabled={isCreatingMember}
              className="min-h-[44px] px-5 py-2 border border-neutral-900 hover:border-neutral-700 text-xs font-bold uppercase tracking-wider rounded text-neutral-900 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 touch-manipulation select-none flex-shrink-0"
            >
              {isCreatingMember ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Add Account</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
