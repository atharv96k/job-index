import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Briefcase, 
  Copy, 
  Check, 
  Trash2, 
  Plus, 
  Lock, 
  Unlock, 
  FileText, 
  Upload, 
  Search, 
  Sparkles, 
  Eye, 
  Key, 
  CheckCircle2, 
  AlertTriangle,
  ArrowUpRight,
  X,
  FileCheck,
  Star,
  FileDown
} from 'lucide-react';

// Connects to your Render backend in production or localhost in development
const API_BASE =  'http://localhost:5000/api';

export default function App() {
  // Session & Authentication state (restores unlocked session on page refresh)
  const [storedPin, setStoredPin] = useState(() => sessionStorage.getItem('jobdrop_session_pin') || '');
  const [isAdmin, setIsAdmin] = useState(() => Boolean(sessionStorage.getItem('jobdrop_session_pin')));
  const [pinInput, setPinInput] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinError, setPinError] = useState('');

  // Change PIN flow state
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [changePinError, setChangePinError] = useState('');

  // Cloud data states (synced with MongoDB Atlas)
  const [jobs, setJobs] = useState([]);
  const [resume, setResume] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('active'); // 'active' | 'applied' | 'starred' | 'all'
  const [copiedId, setCopiedId] = useState(null);

  // Modals & Notifications
  const [showAddModal, setShowAddModal] = useState(false);
  const [showResumeUploadModal, setShowResumeUploadModal] = useState(false);
  const [showPdfViewerModal, setShowPdfViewerModal] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // File upload states
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Form input state for adding a link
  const [newJob, setNewJob] = useState({
    title: '',
    company: '',
    url: '',
    tag: 'Remote',
    urgency: 'medium',
    notes: '',
    starred: false
  });

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  // Fetch initial data from backend (MongoDB Atlas)
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [jobsRes, resumeRes] = await Promise.all([
        fetch(`${API_BASE}/jobs`),
        fetch(`${API_BASE}/resume`)
      ]);

      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        setJobs(jobsData);
      }

      if (resumeRes.ok) {
        const resumeData = await resumeRes.json();
        setResume(resumeData);
      }
    } catch (err) {
      console.error('API sync error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUrlInput = (e) => {
    const val = e.target.value;
    setNewJob((prev) => {
      const updated = { ...prev, url: val };
      if (!prev.company && val) {
        try {
          const parsed = new URL(val.startsWith('http') ? val : `https://${val}`);
          const domain = parsed.hostname.replace('www.', '').split('.')[0];
          if (domain && domain !== 'localhost') {
            updated.company = domain.charAt(0).toUpperCase() + domain.slice(1);
          }
        } catch {
          // typing incomplete URL
        }
      }
      return updated;
    });
  };

  // 1. Unlock Admin Mode via Backend API (Queries MongoDB Atlas)
  const handleUnlockAdmin = async (e) => {
    e.preventDefault();
    setPinError('');
    try {
      const res = await fetch(`${API_BASE}/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput })
      });

      if (res.ok) {
        setIsAdmin(true);
        setStoredPin(pinInput);
        sessionStorage.setItem('jobdrop_session_pin', pinInput);
        setShowPinModal(false);
        setPinInput('');
        showToast('Admin Mode Unlocked');
      } else {
        const data = await res.json();
        setPinError(data.error || 'Incorrect PIN');
      }
    } catch (err) {
      setPinError('Unable to connect to server');
    }
  };

  // 2. Update PIN in MongoDB Atlas across all devices
  const handleUpdatePin = async (e) => {
    e.preventDefault();
    if (newPin.length < 4) {
      setChangePinError('PIN must be at least 4 digits');
      return;
    }
    if (newPin !== confirmPin) {
      setChangePinError('PINs do not match');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/update-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': storedPin
        },
        body: JSON.stringify({ newPin })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update PIN');

      setStoredPin(newPin);
      sessionStorage.setItem('jobdrop_session_pin', newPin);
      setShowChangePinModal(false);
      setNewPin('');
      setConfirmPin('');
      setChangePinError('');
      showToast('PIN updated across all devices!');
    } catch (err) {
      setChangePinError(err.message);
    }
  };

  // 3. Lock button clears session
  const handleLockAdmin = () => {
    setIsAdmin(false);
    setStoredPin('');
    sessionStorage.removeItem('jobdrop_session_pin');
    showToast('Switched to Guest Mode');
  };

  // Add Job Link -> POST to MongoDB Atlas
  const handleCreateJob = async (e) => {
    e.preventDefault();
    if (!newJob.url.trim()) return;

    let formattedUrl = newJob.url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = 'https://' + formattedUrl;
    }

    const payload = {
      title: newJob.title.trim() || 'Job Opening',
      company: newJob.company.trim() || 'Company Link',
      url: formattedUrl,
      tag: newJob.tag.trim() || 'General',
      urgency: newJob.urgency,
      starred: newJob.starred,
      notes: newJob.notes.trim(),
      status: 'active'
    };

    try {
      const res = await fetch(`${API_BASE}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': storedPin
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save job');
      }

      const savedJob = await res.json();
      setJobs([savedJob, ...jobs]);
      setNewJob({ title: '', company: '', url: '', tag: 'Remote', urgency: 'medium', notes: '', starred: false });
      setShowAddModal(false);
      showToast('Job link added');
    } catch (err) {
      alert(err.message || 'Error saving link');
    }
  };

  // Status Toggle -> PATCH to MongoDB Atlas
  const toggleJobStatus = async (job) => {
    const id = job._id || job.id;
    const nextStatus = job.status === 'active' ? 'applied' : 'active';

    try {
      const res = await fetch(`${API_BASE}/jobs/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': storedPin
        },
        body: JSON.stringify({ status: nextStatus })
      });

      if (!res.ok) throw new Error('Update failed');

      setJobs((prev) =>
        prev.map((j) => ((j._id || j.id) === id ? { ...j, status: nextStatus } : j))
      );
      showToast('Status updated');
    } catch (err) {
      showToast('Failed to update status');
    }
  };

  // Star Toggle -> PATCH to MongoDB Atlas
  const toggleJobStar = async (job) => {
    const id = job._id || job.id;
    const nextStar = !job.starred;

    try {
      const res = await fetch(`${API_BASE}/jobs/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': storedPin
        },
        body: JSON.stringify({ starred: nextStar })
      });

      if (!res.ok) throw new Error('Star update failed');

      setJobs((prev) =>
        prev.map((j) => ((j._id || j.id) === id ? { ...j, starred: nextStar } : j))
      );
    } catch (err) {
      showToast('Failed to update star');
    }
  };

  // Delete Job -> DELETE to MongoDB Atlas
  const handleDeleteJob = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/jobs/${id}`, {
        method: 'DELETE',
        headers: {
          'x-admin-pin': storedPin
        }
      });

      if (!res.ok) throw new Error('Delete failed');

      setJobs((prev) => prev.filter((j) => (j._id || j.id) !== id));
      showToast('Link removed');
    } catch (err) {
      showToast('Failed to delete link');
    }
  };

  // PDF Resume Upload -> POST Multipart to MongoDB Atlas
  const processUploadedPdf = async (file) => {
    setUploadError('');

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setUploadError('Please select a genuine .pdf file');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setUploadError('PDF file is too large. Max limit is 8MB');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const res = await fetch(`${API_BASE}/resume`, {
        method: 'POST',
        headers: {
          'x-admin-pin': storedPin
        },
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Upload failed');
      }

      const resumeRes = await fetch(`${API_BASE}/resume`);
      const updatedResume = await resumeRes.json();
      setResume(updatedResume);

      setShowResumeUploadModal(false);
      showToast('Resume updated');
    } catch (err) {
      setUploadError(err.message || 'Failed to upload PDF');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processUploadedPdf(e.dataTransfer.files[0]);
    }
  };

  // Direct 1-Click Resume Download for Laptop
  const handleDirectDownloadResume = () => {
    const pdfData = resume?.pdfBase64 || resume?.dataUrl;
    if (!resume || !pdfData) {
      showToast('No resume file available');
      return;
    }

    try {
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = pdfData;
      downloadAnchor.download = resume.fileName || 'Resume.pdf';
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
      showToast(`Downloaded: ${resume.fileName}`);
    } catch (err) {
      console.error(err);
      window.open(pdfData, '_blank');
    }
  };

  const copyUrl = (url, id) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    showToast('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 1800);
  };

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesSearch =
        (job.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (job.company || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (job.tag || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (job.notes || '').toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (activeFilter === 'active') return job.status === 'active';
      if (activeFilter === 'applied') return job.status === 'applied';
      if (activeFilter === 'starred') return job.starred === true;
      return true;
    });
  }, [jobs, searchQuery, activeFilter]);

  const activeCount = useMemo(() => jobs.filter((j) => j.status === 'active').length, [jobs]);
  const appliedCount = useMemo(() => jobs.filter((j) => j.status === 'applied').length, [jobs]);
  const starredCount = useMemo(() => jobs.filter((j) => j.starred).length, [jobs]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md px-4 py-3 sm:px-6">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-sky-400 flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Briefcase className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="font-bold tracking-tight text-white text-base">JobDrop</h1>
              <p className="text-[11px] text-slate-400">Application Hub</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin ? (
              <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded-xl p-1">
                <span className="text-xs text-amber-400 font-medium px-2 flex items-center gap-1">
                  <Unlock className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline">Admin</span>
                </span>
                <button
                  onClick={() => setShowChangePinModal(true)}
                  className="text-xs text-slate-400 hover:text-amber-300 px-1.5 py-1 rounded transition"
                  title="Change PIN"
                >
                  PIN
                </button>
                <button
                  onClick={handleLockAdmin}
                  className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 px-2 py-1 rounded-lg transition"
                >
                  Lock
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowPinModal(true)}
                className="flex items-center gap-1.5 text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-indigo-500/40 px-3 py-1.5 rounded-xl transition"
                title="Unlock to add/manage links"
              >
                <Lock className="h-3.5 w-3.5 text-slate-400" />
                <span>Admin</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-5 sm:py-6 flex flex-col gap-4">
        
        {/* Resume Card */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-white">Resume</h2>
                  {resume?.fileSize && (
                    <span className="text-[10px] bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded-full font-mono">
                      {resume.fileSize}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 truncate max-w-[220px] sm:max-w-xs mt-0.5">
                  {resume ? resume.fileName : 'No resume uploaded yet'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {resume && (
                <button
                  onClick={() => setShowPdfViewerModal(true)}
                  className="flex items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium px-3 py-2 rounded-xl border border-slate-700 transition"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Preview</span>
                </button>
              )}

              <button
                onClick={handleDirectDownloadResume}
                disabled={!resume}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
              >
                <FileDown className="h-4 w-4" />
                <span>Download PDF</span>
              </button>

              {isAdmin && (
                <button
                  onClick={() => setShowResumeUploadModal(true)}
                  className="flex items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-medium px-3 py-2 rounded-xl border border-indigo-500/30 transition"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>{resume ? 'Replace' : 'Upload'}</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Search & Actions */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search jobs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                >
                  Clear
                </button>
              )}
            </div>

            <button
              onClick={() => {
                if (isAdmin) {
                  setShowAddModal(true);
                } else {
                  setShowPinModal(true);
                }
              }}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-sm transition active:scale-95 shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Add Link</span>
            </button>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-1.5 text-xs border-b border-slate-800 pb-2 overflow-x-auto">
            <button
              onClick={() => setActiveFilter('active')}
              className={`px-3 py-1.5 rounded-xl font-medium transition flex items-center gap-1.5 ${
                activeFilter === 'active'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>To Apply</span>
              <span className="bg-slate-800 px-1.5 py-0.2 rounded-full text-[10px] font-mono text-indigo-400">
                {activeCount}
              </span>
            </button>

            <button
              onClick={() => setActiveFilter('starred')}
              className={`px-3 py-1.5 rounded-xl font-medium transition flex items-center gap-1.5 ${
                activeFilter === 'starred'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Star className="h-3 w-3" />
              <span>Starred</span>
              <span className="bg-slate-800 px-1.5 py-0.2 rounded-full text-[10px] font-mono text-amber-400">
                {starredCount}
              </span>
            </button>

            <button
              onClick={() => setActiveFilter('applied')}
              className={`px-3 py-1.5 rounded-xl font-medium transition flex items-center gap-1.5 ${
                activeFilter === 'applied'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Applied</span>
              <span className="bg-slate-800 px-1.5 py-0.2 rounded-full text-[10px] font-mono text-slate-400">
                {appliedCount}
              </span>
            </button>

            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-xl font-medium transition ${
                activeFilter === 'all'
                  ? 'bg-slate-800 text-slate-200 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({jobs.length})
            </button>
          </div>
        </div>

        {/* Linktree Button List */}
        <section className="flex flex-col gap-3">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-slate-500">Loading links...</div>
          ) : filteredJobs.length === 0 ? (
            <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl py-12 px-4 text-center flex flex-col items-center justify-center">
              <Briefcase className="h-8 w-8 text-slate-700 mb-2" />
              <p className="text-sm font-medium text-slate-300">No job links right now</p>
              <p className="text-xs text-slate-500 mt-1">Unlock with PIN to paste links from your phone.</p>
            </div>
          ) : (
            filteredJobs.map((job) => {
              const jobId = job._id || job.id;
              const isApplied = job.status === 'applied';

              return (
                <div
                  key={jobId}
                  className={`bg-slate-900/80 hover:bg-slate-900 border rounded-2xl p-4 flex flex-col gap-3 transition ${
                    isApplied
                      ? 'border-slate-800/40 opacity-60'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-bold text-indigo-400 uppercase">
                          {job.company}
                        </span>

                        <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">
                          {job.tag}
                        </span>

                        {job.urgency === 'high' && (
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            Urgent
                          </span>
                        )}
                      </div>

                      <h3 className={`text-base font-semibold truncate ${isApplied ? 'line-through text-slate-400' : 'text-slate-100'}`}>
                        {job.title}
                      </h3>

                      {job.notes && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2 bg-slate-950/40 p-2 rounded-xl border border-slate-800/50">
                          {job.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isAdmin && (
                        <>
                          <button
                            onClick={() => toggleJobStar(job)}
                            className={`p-1.5 rounded-lg border transition ${
                              job.starred
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                : 'border-slate-800 text-slate-600 hover:text-slate-400'
                            }`}
                          >
                            <Star className="h-4 w-4 fill-current" />
                          </button>

                          <button
                            onClick={() => toggleJobStatus(job)}
                            className={`p-1.5 rounded-lg border transition ${
                              isApplied
                                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                                : 'border-slate-800 text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60 text-xs">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => copyUrl(job.url, jobId)}
                        className="flex items-center gap-1 text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 px-2.5 py-1.5 rounded-lg transition"
                      >
                        {copiedId === jobId ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>{copiedId === jobId ? 'Copied' : 'Copy'}</span>
                      </button>

                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteJob(jobId)}
                          className="flex items-center gap-1 text-slate-400 hover:text-rose-400 bg-slate-800/60 hover:bg-slate-800 px-2.5 py-1.5 rounded-lg transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>

                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-1.5 rounded-xl transition"
                    >
                      <span>Apply Now</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </main>

      {/* Add Job Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-base font-semibold text-white mb-3">Add Job Link</h3>

            <form onSubmit={handleCreateJob} className="flex flex-col gap-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Job URL *</label>
                <input
                  type="text"
                  required
                  placeholder="https://company.com/apply/..."
                  value={newJob.url}
                  onChange={handleUrlInput}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Company</label>
                  <input
                    type="text"
                    placeholder="e.g. Google"
                    value={newJob.company}
                    onChange={(e) => setNewJob({ ...newJob, company: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Role Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Software Engineer"
                    value={newJob.title}
                    onChange={(e) => setNewJob({ ...newJob, title: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Tag</label>
                  <input
                    type="text"
                    placeholder="Remote / Hybrid"
                    value={newJob.tag}
                    onChange={(e) => setNewJob({ ...newJob, tag: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Priority</label>
                  <select
                    value={newJob.urgency}
                    onChange={(e) => setNewJob({ ...newJob, urgency: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none"
                  >
                    <option value="high">High Urgency</option>
                    <option value="medium">Standard</option>
                    <option value="low">Casual</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Notes</label>
                <textarea
                  rows="2"
                  placeholder="Referral contact, notes, or tips..."
                  value={newJob.notes}
                  onChange={(e) => setNewJob({ ...newJob, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition"
                >
                  Save Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload PDF Modal */}
      {showResumeUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative text-xs">
            <button
              onClick={() => {
                setShowResumeUploadModal(false);
                setUploadError('');
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-base font-semibold text-white mb-1">Upload PDF Resume</h3>
            <p className="text-slate-400 mb-4">Updates the resume available for download on any computer</p>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleFileDrop}
              className={`border-2 border-dashed rounded-2xl p-6 text-center flex flex-col items-center justify-center transition cursor-pointer ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-950/50'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <FileCheck className="h-8 w-8 text-indigo-400 mb-2" />
              <p className="font-semibold text-slate-200">
                {isUploading ? 'Uploading...' : 'Tap or drop your PDF here'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Accepts genuine .pdf files up to 8MB</p>

              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf,application/pdf"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    processUploadedPdf(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              <button
                type="button"
                disabled={isUploading}
                className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
              >
                {isUploading ? 'Uploading...' : 'Browse Files'}
              </button>
            </div>

            {uploadError && (
              <div className="mt-3 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {showPdfViewerModal && resume && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl h-[90vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div>
                <h3 className="text-sm font-semibold text-white truncate max-w-xs sm:max-w-md">
                  {resume.fileName}
                </h3>
                <p className="text-[11px] text-slate-400">{resume.fileSize}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDirectDownloadResume}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3.5 py-1.5 rounded-xl transition"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  <span>Download</span>
                </button>
                <button
                  onClick={() => setShowPdfViewerModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-950/80 p-1 flex items-center justify-center relative">
              <iframe
                src={resume.pdfBase64 || resume.dataUrl}
                title="PDF Resume Preview"
                className="w-full h-full rounded-b-xl border-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Enter PIN Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative text-center">
            <button
              onClick={() => {
                setShowPinModal(false);
                setPinError('');
                setPinInput('');
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mx-auto w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-3">
              <Key className="h-6 w-6" />
            </div>

            <h3 className="text-base font-semibold text-white">Enter Admin PIN</h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Enter your PIN to manage job links and resume
            </p>

            <form onSubmit={handleUnlockAdmin} className="flex flex-col gap-3">
              <input
                type="password"
                maxLength="8"
                autoFocus
                placeholder="PIN"
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError('');
                }}
                className="w-full text-center tracking-[0.4em] text-lg font-mono bg-slate-950 border border-slate-800 rounded-xl py-2.5 text-white placeholder-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />

              {pinError && <p className="text-xs text-rose-400">{pinError}</p>}

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition"
              >
                Unlock
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Change PIN Modal */}
      {showChangePinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative">
            <button
              onClick={() => {
                setShowChangePinModal(false);
                setChangePinError('');
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-base font-semibold text-white mb-1">Set New PIN</h3>
            <p className="text-xs text-slate-400 mb-4">Choose a quick PIN for phone unlocking</p>

            <form onSubmit={handleUpdatePin} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">New PIN</label>
                <input
                  type="password"
                  required
                  maxLength="8"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  className="w-full font-mono bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Confirm PIN</label>
                <input
                  type="password"
                  required
                  maxLength="8"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  className="w-full font-mono bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              {changePinError && <p className="text-xs text-rose-400">{changePinError}</p>}

              <button
                type="submit"
                className="w-full py-2.5 mt-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition"
              >
                Save PIN
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-indigo-500/40 text-slate-200 text-xs px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}