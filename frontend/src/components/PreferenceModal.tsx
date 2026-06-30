import { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/api.js';
import { cn } from '../utils/index.js';

interface PreferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (preferences: any) => void;
  currentPreferences?: any;
}

const LANGUAGES = [
  'English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Malayalam',
  'Spanish', 'French', 'German', 'Japanese', 'Chinese', 'Arabic', 'Russian'
];

export function PreferenceModal({ isOpen, onClose, onSave, currentPreferences = {} }: PreferenceModalProps) {
  const [activeTab, setActiveTab] = useState<'location' | 'interests'>('location');
  const [gender, setGender] = useState<string>(currentPreferences.gender || 'Prefer not to say');
  const [lookingFor, setLookingFor] = useState<string[]>(currentPreferences.looking_for || ['Anyone']);
  
  // Location selections
  const [country, setCountry] = useState<string>(currentPreferences.country || '');
  const [state, setState] = useState<string>(currentPreferences.state || '');
  const [district, setDistrict] = useState<string>(currentPreferences.district || '');
  const [city, setCity] = useState<string>(currentPreferences.city || '');
  
  // Interests & Languages
  const [interestTags, setInterestTags] = useState<string[]>(currentPreferences.interest_tags || []);
  const [languages, setLanguages] = useState<string[]>(currentPreferences.languages || ['English']);

  // Autocomplete state
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResults, setLocationResults] = useState<any[]>([]);
  const [interestQuery, setInterestQuery] = useState('');
  const [interestResults, setInterestResults] = useState<any[]>([]);

  const locationDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interestDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce locations autocomplete
  useEffect(() => {
    if (!locationQuery.trim()) {
      setLocationResults([]);
      return;
    }
    if (locationDebounce.current) clearTimeout(locationDebounce.current);
    locationDebounce.current = setTimeout(async () => {
      try {
        const results = await apiService.getLocations(locationQuery);
        setLocationResults(results);
      } catch (err) {
        console.error(err);
      }
    }, 250);

    return () => {
      if (locationDebounce.current) clearTimeout(locationDebounce.current);
    };
  }, [locationQuery]);

  // Debounce interests autocomplete
  useEffect(() => {
    if (!interestQuery.trim()) {
      setInterestResults([]);
      return;
    }
    if (interestDebounce.current) clearTimeout(interestDebounce.current);
    interestDebounce.current = setTimeout(async () => {
      try {
        const results = await apiService.getInterests(interestQuery);
        setInterestResults(results);
      } catch (err) {
        console.error(err);
      }
    }, 250);

    return () => {
      if (interestDebounce.current) clearTimeout(interestDebounce.current);
    };
  }, [interestQuery]);

  if (!isOpen) return null;

  const handleLookingForChange = (val: string) => {
    if (val === 'Anyone') {
      setLookingFor(['Anyone']);
    } else {
      let updated = lookingFor.filter(x => x !== 'Anyone');
      if (updated.includes(val)) {
        updated = updated.filter(x => x !== val);
      } else {
        updated.push(val);
      }
      if (updated.length === 0) updated = ['Anyone'];
      setLookingFor(updated);
    }
  };

  const handleSelectLocation = (loc: any) => {
    setCountry(loc.country || '');
    setState(loc.state || '');
    setDistrict(loc.district || '');
    setCity(loc.city || '');
    setLocationQuery('');
    setLocationResults([]);
  };

  const handleSelectInterest = (name: string) => {
    if (!interestTags.includes(name)) {
      setInterestTags([...interestTags, name]);
    }
    setInterestQuery('');
    setInterestResults([]);
  };

  const removeInterest = (name: string) => {
    setInterestTags(interestTags.filter(x => x !== name));
  };

  const toggleLanguage = (lang: string) => {
    if (languages.includes(lang)) {
      setLanguages(languages.filter(x => x !== lang));
    } else {
      setLanguages([...languages, lang]);
    }
  };

  const handleReset = () => {
    setGender('Prefer not to say');
    setLookingFor(['Anyone']);
    setCountry('');
    setState('');
    setDistrict('');
    setCity('');
    setInterestTags([]);
    setLanguages(['English']);
  };

  const handleSave = () => {
    onSave({
      gender,
      looking_for: lookingFor,
      languages,
      country: country || null,
      state: state || null,
      district: district || null,
      city: city || null,
      interest_tags: interestTags,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md transition-opacity">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] sm:max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-white/10 bg-slate-950">
          <h2 className="text-xl font-bold text-white bg-gradient-to-r from-accent to-pink-400 bg-clip-text text-transparent">Match Preferences</h2>
          <button onClick={onClose} className="p-2 text-white/50 hover:text-white rounded-full hover:bg-white/5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Identity & Matching */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">I Am</label>
              <div className="grid grid-cols-2 gap-2">
                {['Male', 'Female', 'Non Binary', 'Prefer not to say'].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={cn(
                      "px-3 py-2 text-sm rounded-xl font-medium border text-center transition-all duration-200",
                      gender === g 
                        ? "bg-accent border-accent text-white shadow-lg shadow-accent/20" 
                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Looking For</label>
              <div className="grid grid-cols-3 gap-2">
                {['Male', 'Female', 'Anyone'].map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => handleLookingForChange(l)}
                    className={cn(
                      "px-3 py-2 text-sm rounded-xl font-medium border text-center transition-all duration-200",
                      lookingFor.includes(l)
                        ? "bg-accent border-accent text-white shadow-lg shadow-accent/20" 
                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Location & Interest Tabs */}
          <div>
            <div className="flex border-b border-white/10 mb-4">
              <button
                onClick={() => setActiveTab('location')}
                className={cn(
                  "flex-1 pb-3 text-sm font-semibold border-b-2 transition-all",
                  activeTab === 'location' 
                    ? "border-accent text-accent-light" 
                    : "border-transparent text-white/50 hover:text-white"
                )}
              >
                📍 Location
              </button>
              <button
                onClick={() => setActiveTab('interests')}
                className={cn(
                  "flex-1 pb-3 text-sm font-semibold border-b-2 transition-all",
                  activeTab === 'interests' 
                    ? "border-accent text-accent-light" 
                    : "border-transparent text-white/50 hover:text-white"
                )}
              >
                ✨ Interests & Languages
              </button>
            </div>

            {activeTab === 'location' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-white/50 uppercase mb-2">Search Location</label>
                  <input
                    type="text"
                    placeholder="Search by city, state, or country..."
                    value={locationQuery}
                    onChange={(e) => setLocationQuery(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-accent"
                  />
                  {locationResults.length > 0 && (
                    <div className="mt-2 bg-slate-950 border border-white/10 rounded-xl max-h-48 overflow-y-auto divide-y divide-white/5 shadow-xl">
                      {locationResults.map((loc) => (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => handleSelectLocation(loc)}
                          className="w-full px-4 py-3 text-left hover:bg-white/5 text-sm text-white/80 flex justify-between items-center"
                        >
                          <span>{loc.name}</span>
                          <span className="text-xs text-white/30 capitalize">{loc.type}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected Location Details */}
                {(country || state || city) && (
                  <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-accent-light">Selected Location:</h4>
                      <p className="text-xs text-white/70 mt-1">
                        {[city, state, country].filter(Boolean).join(' • ')}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setCountry('');
                        setState('');
                        setDistrict('');
                        setCity('');
                      }}
                      className="text-xs text-red-400 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'interests' && (
              <div className="space-y-6">
                {/* Interests Search */}
                <div>
                  <label className="block text-xs text-white/50 uppercase mb-2">Interests (Autocomplete)</label>
                  <input
                    type="text"
                    placeholder="Search e.g. Gaming, Cricket, Chess, AI..."
                    value={interestQuery}
                    onChange={(e) => setInterestQuery(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-accent"
                  />
                  {interestResults.length > 0 && (
                    <div className="mt-2 bg-slate-950 border border-white/10 rounded-xl max-h-48 overflow-y-auto divide-y divide-white/5 shadow-xl">
                      {interestResults.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectInterest(item.name)}
                          className="w-full px-4 py-3 text-left hover:bg-white/5 text-sm text-white/80 flex justify-between items-center"
                        >
                          <span>{item.name}</span>
                          <span className="text-xs px-2 py-0.5 bg-accent/20 text-accent-light rounded-full text-[10px]">{item.category}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Active Tags */}
                  {interestTags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {interestTags.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 text-white rounded-full text-xs border border-white/5">
                          {t}
                          <button onClick={() => removeInterest(t)} className="hover:text-red-400 font-bold ml-1">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Languages list */}
                <div>
                  <label className="block text-xs text-white/50 uppercase mb-2">Languages</label>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => toggleLanguage(lang)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200",
                          languages.includes(lang) 
                            ? "bg-accent/20 border-accent text-accent-light" 
                            : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10"
                        )}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-white/10 bg-slate-950 flex items-center justify-between">
          <button
            onClick={handleReset}
            className="px-4 py-2 border border-white/10 hover:bg-white/5 text-white/60 hover:text-white text-sm rounded-xl font-medium"
          >
            Reset All
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-white/10 hover:bg-white/5 text-white text-sm rounded-xl font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-gradient-to-r from-accent to-purple-600 hover:opacity-90 text-white text-sm rounded-xl font-semibold shadow-lg shadow-accent/20"
            >
              Save & Join
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
