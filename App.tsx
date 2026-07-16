
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MACHINE_LAYOUT, INITIAL_EMPLOYEES } from './constants';
import { MachineData, Employee, Priority, MachineStatus } from './types';
import MachineCard from './components/MachineCard';
import MachineDetailModal from './components/MachineDetailModal';

const App: React.FC = () => {
  const [machines, setMachines] = useState<MachineData[]>(() => {
    const defaultMachines = MACHINE_LAYOUT.map(config => ({
      id: config.id,
      name: config.name,
      type: config.type,
      assignedEmployees: [],
      currentJob: '',
      processTime: '',
      notes: '',
      priority: Priority.LOW,
      status: MachineStatus.FERMA
    }));
    
    const savedMachines = localStorage.getItem('workshop_data_v2');
    if (savedMachines) {
      try {
        const parsedSaved: MachineData[] = JSON.parse(savedMachines);
        return MACHINE_LAYOUT.map(config => {
          const existing = parsedSaved.find(m => m.id === config.id);
          return existing ? {
            ...existing,
            processTime: existing.processTime || '',
            status: existing.status || (existing.currentJob ? MachineStatus.LAVORAZIONE : MachineStatus.FERMA)
          } : {
            id: config.id,
            name: config.name,
            type: config.type,
            assignedEmployees: [],
            currentJob: '',
            processTime: '',
            notes: '',
            priority: Priority.LOW,
            status: MachineStatus.FERMA
          };
        });
      } catch (e) {
        return defaultMachines;
      }
    }
    return defaultMachines;
  });

  const [employees, setEmployees] = useState<Employee[]>(() => {
    const savedEmployees = localStorage.getItem('workshop_employees_v2');
    if (savedEmployees) {
      try {
        return JSON.parse(savedEmployees);
      } catch (e) {
        return INITIAL_EMPLOYEES;
      }
    }
    return INITIAL_EMPLOYEES;
  });

  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'map' | 'employees' | 'menu'>('map');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfFileInputRef = useRef<HTMLInputElement>(null);

  const [shiftLeaders, setShiftLeaders] = useState<string[]>(() => {
    const saved = localStorage.getItem('workshop_shift_leaders_v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return ['Da assegnare', 'Da assegnare'];
      }
    }
    return ['Da assegnare', 'Da assegnare'];
  });

  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfUserInstructions, setPdfUserInstructions] = useState('');
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);

  // States for backend real-time synchronization
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'synced' | 'error' | 'idle'>('idle');
  const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);
  const [lastLocalUpdate, setLastLocalUpdate] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('workshop_last_local_update') || '0');
    } catch (e) {
      return 0;
    }
  });
  const skipNextTimestampUpdate = useRef(false);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleNativeInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`Risposta installazione: ${outcome}`);
      setDeferredPrompt(null);
    }
  };

  // New mobile-friendly states
  const [viewMode, setViewMode] = useState<'map' | 'list'>(() => {
    try {
      return window.innerWidth < 768 ? 'list' : 'map';
    } catch (e) {
      return 'map';
    }
  });
  const [quickAssignOperator, setQuickAssignOperator] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  interface CustomConfirmation {
    title: string;
    message: string;
    actionText: string;
    type: 'danger' | 'info' | 'warning';
    onConfirm: () => void;
  }
  const [customConfirm, setCustomConfirm] = useState<CustomConfirmation | null>(null);

  const requestConfirm = (
    title: string,
    message: string,
    actionText: string,
    onConfirm: () => void,
    type: 'danger' | 'info' | 'warning' = 'danger'
  ) => {
    setCustomConfirm({ title, message, actionText, type, onConfirm });
  };

  // Refs to control master cloud synchronization and avoid loops
  const lastLocalUpdateRef = useRef<number>(
    (() => {
      try {
        return Number(localStorage.getItem('workshop_last_local_update') || '0');
      } catch (e) {
        return 0;
      }
    })()
  );
  const isDirty = useRef(false);

  // Load initial data from central server database (Cloud Sync)
  useEffect(() => {
    const fetchCloudSchedule = async () => {
      try {
        const response = await fetch('/api/schedule');
        const result = await response.json();
        
        if (result && result.success && result.data) {
          const { 
            machines: cloudMachines, 
            employees: cloudEmployees, 
            shiftLeaders: cloudShiftLeaders,
            updatedAt: cloudUpdatedAt 
          } = result.data;
          
          const serverTime = cloudUpdatedAt ? new Date(cloudUpdatedAt).getTime() : 0;
          const localTime = lastLocalUpdateRef.current;
          
          // Last-Write-Wins: If local storage has a newer user modification timestamp, preserve it!
          if (localTime > serverTime) {
            console.log("Stato locale più recente di quello sul server. Conservo lo stato locale per backup.");
            isDirty.current = true; // Mark as dirty so it gets backed up onto the server
            setSyncStatus('synced');
          } else {
            console.log("Stato del server più recente o uguale. Carico i dati dal Cloud.");
            skipNextTimestampUpdate.current = true;
            if (cloudMachines && cloudMachines.length > 0) {
              setMachines(cloudMachines);
            }
            if (cloudEmployees && cloudEmployees.length > 0) {
              setEmployees(cloudEmployees);
            }
            if (cloudShiftLeaders && cloudShiftLeaders.length > 0) {
              setShiftLeaders(cloudShiftLeaders);
            }
            localStorage.setItem('workshop_last_local_update', String(serverTime));
            lastLocalUpdateRef.current = serverTime;
            isDirty.current = false;
            setSyncStatus('synced');
          }
        } else {
          // No cloud database file found (e.g. server restart). Mark as dirty so we backup local state onto the server
          console.log("Nessun piano cloud trovato sul database. Preparo il backup del dispositivo sul server.");
          isDirty.current = lastLocalUpdateRef.current > 0; // Only backup if this local copy has actually been used/modified
          setSyncStatus('synced');
        }
      } catch (err) {
        console.error("Errore nel caricamento del piano cloud sul server:", err);
        setSyncStatus('error');
      } finally {
        setIsInitialLoadDone(true);
      }
    };

    fetchCloudSchedule();
  }, []);

  // Sync to local storage & backing cloud file on the Express server (Auto-Save)
  useEffect(() => {
    if (machines.length > 0) {
      localStorage.setItem('workshop_data_v2', JSON.stringify(machines));
    }
  }, [machines]);

  useEffect(() => {
    localStorage.setItem('workshop_employees_v2', JSON.stringify(employees));
  }, [employees]);

  useEffect(() => {
    localStorage.setItem('workshop_shift_leaders_v2', JSON.stringify(shiftLeaders));
  }, [shiftLeaders]);

  // Track local modifications to update lastLocalUpdate timestamp and mark dirty AFTER initial load is done
  useEffect(() => {
    if (!isInitialLoadDone) return;
    
    if (skipNextTimestampUpdate.current) {
      skipNextTimestampUpdate.current = false;
      return;
    }
    
    const now = Date.now();
    lastLocalUpdateRef.current = now;
    localStorage.setItem('workshop_last_local_update', String(now));
    isDirty.current = true;
  }, [machines, employees, shiftLeaders, isInitialLoadDone]);

  // DB Sync Routine to Central Node/Express Backend Server
  useEffect(() => {
    if (!isInitialLoadDone) return;

    const saveTimeout = setTimeout(async () => {
      // If client is not dirty or lastLocalUpdateRef is 0, we do not need to sync
      if (!isDirty.current || lastLocalUpdateRef.current === 0) {
        setSyncStatus('synced');
        return;
      }

      setSyncStatus('syncing');
      try {
        const res = await fetch('/api/schedule', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            machines,
            employees,
            shiftLeaders,
            updatedAt: new Date(lastLocalUpdateRef.current).toISOString()
          })
        });
        
        if (res.ok) {
          const resData = await res.json();
          if (resData && resData.updatedAt) {
            const returnedTime = new Date(resData.updatedAt).getTime();
            // Prevent our local tracking useEffect from picking up this update as a new user change
            skipNextTimestampUpdate.current = true;
            lastLocalUpdateRef.current = returnedTime;
            localStorage.setItem('workshop_last_local_update', String(returnedTime));
          }
          isDirty.current = false;
          setSyncStatus('synced');
        } else {
          setSyncStatus('error');
        }
      } catch (e) {
        console.error("Errore di sincronizzazione col server:", e);
        setSyncStatus('error');
      }
    }, 1500); // 1.5 seconds debounce to ensure smooth updates without API spamming

    return () => clearTimeout(saveTimeout);
  }, [machines, employees, shiftLeaders, isInitialLoadDone]);

  // Synchronisation utilities and url helpers
  const getSyncLink = () => {
    try {
      let baseUrl = window.location.origin;
      if (!baseUrl.endsWith('/')) {
        baseUrl += '/';
      }
      if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1') || !baseUrl.startsWith('http')) {
        baseUrl = 'https://ais-dev-tj35yy5mxgxiqo3s4zgvtn-641059975739.europe-west2.run.app/';
      }
      return baseUrl;
    } catch (e) {
      console.error(e);
      return 'https://ais-dev-tj35yy5mxgxiqo3s4zgvtn-641059975739.europe-west2.run.app/';
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(getSyncLink());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Synchronisation handling via URL Hash
  useEffect(() => {
    const handleHashSync = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#sync=')) {
        try {
          let base64 = hash.substring(6);
          // Handle URL-safe base64 replacements
          base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
          // Add padding if missing
          while (base64.length % 4 !== 0) {
            base64 += '=';
          }

          const jsonStr = decodeURIComponent(
            atob(base64)
              .split('')
              .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          );
          const parsed = JSON.parse(jsonStr);
          
          if (parsed && (parsed.e || parsed.m)) {
            requestConfirm(
              "Sincronizzazione Dati Rilevata",
              "Abbiamo trovato una configurazione di operatori e macchine condivisa in questo link.\n\nVuoi caricarla sul tuo dispositivo per sincronizzarti?",
              "Sì, Importa",
              () => {
                if (parsed.e) {
                  setEmployees(parsed.e);
                }
                if (parsed.m) {
                  setMachines(prev => prev.map(m => {
                    const imported = parsed.m.find((x: any) => x.id === m.id);
                    if (imported) {
                      return {
                        ...m,
                        currentJob: imported.j || '',
                        processTime: imported.p || '',
                        notes: imported.n || '',
                        priority: imported.pr || Priority.LOW,
                        status: imported.s || MachineStatus.FERMA,
                        assignedEmployees: imported.emp || []
                      };
                    }
                    return {
                      ...m,
                      currentJob: '',
                      processTime: '',
                      notes: '',
                      priority: Priority.LOW,
                      status: MachineStatus.FERMA,
                      assignedEmployees: []
                    };
                  }));
                }
                // Clear state hash perfectly
                window.history.replaceState(null, '', window.location.pathname);
              },
              'info'
            );
          }
        } catch (err) {
          console.error("Errore durante il caricamento del link di sincronizzazione", err);
          requestConfirm(
            "Errore Sincronizzazione",
            "La chiave di sincronizzazione presente nel link non è valida.",
            "Ok",
            () => {
              window.history.replaceState(null, '', window.location.pathname);
            },
            'danger'
          );
        }
      }
    };
    
    // Run once on load
    handleHashSync();
    
    // Watch for updates
    window.addEventListener('hashchange', handleHashSync);
    return () => window.removeEventListener('hashchange', handleHashSync);
  }, []);

  const handleAddEmployee = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newEmployeeName.trim()) return;
    const newEmp: Employee = { id: Date.now().toString(), name: newEmployeeName.trim() };
    setEmployees(prev => [...prev, newEmp]);
    setNewEmployeeName('');
  };

  const handleRemoveEmployeeFromStaff = (empId: string, empName: string) => {
    requestConfirm(
      "Elimina Operatore",
      `Sei sicuro di voler rimuovere ${empName} dall'elenco del personale? Verrà rimosso anche da eventuali postazioni di lavoro assegnate.`,
      "Rimuovi",
      () => {
        setEmployees(prev => prev.filter(e => e.id !== empId));
        setMachines(prev => prev.map(m => ({
          ...m,
          assignedEmployees: m.assignedEmployees.filter(name => name !== empName)
        })));
      }
    );
  };

  const handleRemoveFreeEmployees = () => {
    const freeEmployees = employees.filter(emp => !busyEmployees.includes(emp.name));
    if (freeEmployees.length === 0) {
      requestConfirm(
        "Nessun Operatore Libero",
        "Tutti gli operatori elencati sono attualmente assegnati e attivi sulle macchine!",
        "Ok",
        () => {},
        'info'
      );
      return;
    }
    const namesList = freeEmployees.map(e => e.name).join(", ");
    requestConfirm(
      "Rimuovi Operatori Liberi",
      `Vuoi rimuovere dall'elenco i seguenti ${freeEmployees.length} operatori non assegnati oggi?\n\n${namesList}`,
      "Rimuovi Liberi",
      () => {
        const freeIds = freeEmployees.map(e => e.id);
        setEmployees(prev => prev.filter(e => !freeIds.includes(e.id)));
      }
    );
  };

  const handleUpdateMachine = (updated: MachineData) => {
    setMachines(prev => prev.map(m => m.id === updated.id ? updated : m));
    setSelectedMachineId(null);
  };

  const handleToggleMachineStatus = (machineId: string) => {
    setMachines(prev => prev.map(m => {
      if (m.id === machineId) {
        const current = m.status || MachineStatus.FERMA;
        let nextStatus: MachineStatus;
        if (current === MachineStatus.LAVORAZIONE) {
          nextStatus = MachineStatus.FERMA;
        } else if (current === MachineStatus.FERMA) {
          nextStatus = MachineStatus.ATTREZZAGGIO;
        } else if (current === MachineStatus.ATTREZZAGGIO) {
          nextStatus = m.currentJob ? MachineStatus.LAVORAZIONE : MachineStatus.FERMA;
        } else {
          nextStatus = MachineStatus.FERMA;
        }
        showToast(`${m.name}: stato cambiato in ${nextStatus}`);
        return { ...m, status: nextStatus };
      }
      return m;
    }));
  };

  const handleDropEmployee = (machineId: string, employeeName: string) => {
    setMachines(prev => prev.map(m => {
      if (m.id === machineId) {
        if (m.assignedEmployees.includes(employeeName)) {
          showToast(`${employeeName} è già assegnato a questa postazione`);
          return m;
        }
        showToast(`${employeeName} assegnato a ${m.name}`);
        return { ...m, assignedEmployees: [...m.assignedEmployees, employeeName] };
      }
      return m;
    }));
  };

  const handleRemoveEmployeeFromMachine = (machineId: string, employeeName: string) => {
    setMachines(prev => prev.map(m => {
      if (m.id === machineId) {
        showToast(`${employeeName} rimosso da ${m.name}`);
        return { ...m, assignedEmployees: m.assignedEmployees.filter(e => e !== employeeName) };
      }
      return m;
    }));
  };

  const exportToExcel = () => {
    // Genera CSV (compatibile con Excel)
    const header = "Postazione;Lavoro;Tempo;Operatori;Priorita;Note\n";
    const rows = machines
      .filter(m => m.currentJob || m.assignedEmployees.length > 0)
      .map(m => {
        const operators = m.assignedEmployees.join(", ");
        return `${m.name};${m.currentJob};${m.processTime};${operators};${m.priority};${m.notes.replace(/\n/g, " ")}`;
      })
      .join("\n");
    
    const csvContent = "data:text/csv;charset=utf-8," + header + rows;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `piano_lavoro_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportData = () => {
    const fullData = { machines, employees };
    const dataStr = JSON.stringify(fullData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', `backup_officina_${new Date().toISOString().split('T')[0]}.json`);
    linkElement.click();
  };

  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const files = event.target.files;
    if (!files || files.length === 0) return;
    fileReader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const imported = JSON.parse(content);
        if (imported.employees) setEmployees(imported.employees);
        const importedMachines = imported.machines || imported;
        const validatedData = MACHINE_LAYOUT.map(config => {
          const existing = importedMachines.find((m: any) => m.id === config.id);
          return existing ? {
            ...existing,
            status: existing.status || (existing.currentJob ? MachineStatus.LAVORAZIONE : MachineStatus.FERMA)
          } : {
            id: config.id,
            name: config.name,
            type: config.type,
            assignedEmployees: [],
            currentJob: '',
            processTime: '',
            notes: '',
            priority: Priority.LOW,
            status: MachineStatus.FERMA
          };
        });
        setMachines(validatedData);
        requestConfirm(
          "Importazione Completata",
          "I dati del personale e della pianificazione dell'officina sono stati importati con successo dal file JSON.",
          "Ok",
          () => {},
          'info'
        );
      } catch (err) {
        requestConfirm(
          "Errore di Importazione",
          "Impossibile leggere il file selezionato. Assicurati che sia un file JSON di backup valido.",
          "Ok",
          () => {},
          'danger'
        );
      }
    };
    fileReader.readAsText(files[0]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const compressImage = (file: File, maxWidth = 1600, maxHeight = 1600, quality = 0.82): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(event.target?.result as string);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedDataUrl);
        };
        img.onerror = (err) => {
          reject(err);
        };
      };
      reader.onerror = (err) => {
        reject(err);
      };
      reader.readAsDataURL(file);
    });
  };

  const proceedWithUpload = async (file: File, instructions: string) => {
    setIsParsingPdf(true);
    try {
      let base64 = "";
      const isImg = file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);

      if (isImg) {
        showToast("Ottimizzazione dell'immagine in corso...");
        base64 = await compressImage(file);
      } else {
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error("Errore di caricamento del file locale."));
          reader.readAsDataURL(file);
        });
      }

      const res = await fetch("/api/parse-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ 
          pdfBase64: base64,
          userInstructions: instructions
        })
      });

      if (!res.ok) {
        let errMsg = "Impossibile elaborare il file.";
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch (e) {
          errMsg = `Stato server: ${res.status} (${res.statusText})`;
        }
        throw new Error(errMsg);
      }

      const result = await res.json();
      if (!result.success || !result.data) {
        throw new Error(result.error || "Nessun dato valido estratto dal file.");
      }

      const parsedData = result.data;
      
      // 1. Set shift leaders
      if (parsedData.shiftLeaders && parsedData.shiftLeaders.length > 0) {
        const cleanedLeaders = parsedData.shiftLeaders.map((s: string) => s.trim()).filter((s: string) => s.length > 0);
        if (cleanedLeaders.length > 0) {
          setShiftLeaders(cleanedLeaders);
          showToast(`Capoturni aggiornati: ${cleanedLeaders.join(' e ')}`);
        }
      }

      // 2. Add as operators inside the roster
      if (parsedData.operators && parsedData.operators.length > 0) {
        setEmployees(prev => {
          const currentNames = prev.map(emp => emp.name.toLowerCase().trim());
          const updated = [...prev];
          let addedCount = 0;
          parsedData.operators.forEach((opName: string) => {
            const clean = opName.trim();
            if (clean && !currentNames.includes(clean.toLowerCase())) {
              updated.push({
                id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
                name: clean
              });
              addedCount++;
            }
          });
          if (addedCount > 0) {
            setTimeout(() => {
              showToast(`Staff aggiornato: aggiunti ${addedCount} nuovi operatori!`);
            }, 1500);
          }
          return updated;
        });
      }

      // 3. Map assignment to machines
      if (parsedData.assignments && parsedData.assignments.length > 0) {
        setMachines(prev => prev.map(m => {
          const match = parsedData.assignments.find(
            (asg: any) => asg.machineId && asg.machineId.toLowerCase().replace(/[^a-z0-9]/g, "") === m.id.toLowerCase()
          );
          if (match) {
            let matchedPriority = Priority.LOW;
            if (match.priority) {
              const normPri = match.priority.toLowerCase();
              if (normPri.includes("urgent")) matchedPriority = Priority.URGENT;
              else if (normPri.includes("high")) matchedPriority = Priority.HIGH;
              else if (normPri.includes("medium")) matchedPriority = Priority.MEDIUM;
            }

            let matchedStatus = MachineStatus.FERMA;
            if (match.status) {
              const normStat = match.status.toLowerCase();
              if (normStat.includes("lavorazione") || normStat.includes("lavoro")) matchedStatus = MachineStatus.LAVORAZIONE;
              else if (normStat.includes("attrezzaggio")) matchedStatus = MachineStatus.ATTREZZAGGIO;
            } else if (match.jobName) {
              matchedStatus = MachineStatus.LAVORAZIONE;
            }

            return {
              ...m,
              currentJob: match.jobName || '',
              processTime: match.processTime || '',
              priority: matchedPriority,
              status: matchedStatus,
              notes: match.notes || m.notes || '',
              assignedEmployees: match.assignedOperators && match.assignedOperators.length > 0 ? match.assignedOperators : m.assignedEmployees
            };
          }
          return m;
        }));
        setTimeout(() => {
          showToast("Pianificazione lavorazioni macchine importata!");
        }, 3000);
      }

      // Close modal on success!
      setIsPdfModalOpen(false);
      setSelectedPdfFile(null);
      setPdfUserInstructions('');

    } catch (err: any) {
      console.error(err);
      
      const errText = String(err.message || err);
      const isFailedToFetch = errText.includes("Failed to fetch") || 
                              errText.toLocaleLowerCase().includes("failed to fetch") ||
                              errText.includes("NetworkError");

      const is503Error = errText.includes("503") || 
                         errText.includes("UNAVAILABLE") || 
                         errText.includes("high demand") || 
                         errText.includes("sovraccarico") ||
                         errText.includes("demand");

      if (is503Error) {
        requestConfirm(
          "I server IA sono molto occupati! ⏰ (Errore 503)",
          `In questo momento i server di intelligenza artificiale di Google stanno registrando un picco straordinario di richieste.\n\nQuesto picco di solito è temporaneo e dura meno di un minuto!\n\n💡 CONTROMISURE FACILI E RISOLUTIVE:\n1. Riprova tra 30 secondi (clicca di nuovo su Carica: l'app proverà canali e modelli alternativi più veloci).\n2. Oppure fai uno SCREENSHOT o una foto della tabella e carica quella! Le immagini vengono compresse instantaneamente a soli 100kb e si caricano all'istante bypassando qualsiasi congestione di rete!`,
          "Riprova subito 👍",
          () => {},
          'warning'
        );
      } else if (isFailedToFetch) {
        requestConfirm(
          "Uffa! Errore di connessione (Failed to fetch) 📡",
          `Il server non ha risposto in tempo o ha rifiutato la richiesta.\n\nQuesto succede quando:\n1. Il file PDF caricato è pesante (limite consigliato: < 1-2 MB).\n2. La connessione di rete si è interrotta temporaneamente.\n\n💡 CONSIGLIO RISOLUTIVO:\nFai uno SCREENSHOT (o una foto) della tabella o del foglio e carica l'immagine di screenshot anziché il PDF!\n\nPerché funziona meglio? Le immagini vengono compresse istantaneamente sul tuo dispositivo a soli 100-200 KB prima dell'invio, risultando fulminee ed esenti da blocchi di rete al 100%!`,
          "Capito, uso un'immagine 👍",
          () => {},
          'warning'
        );
      } else {
        requestConfirm(
          "Errore Lettura Documento",
          `Si è verificato un errore durante l'estrazione dati dal documento:\n\n${err.message || err}`,
          "Ok",
          () => {},
          'danger'
        );
      }
    } finally {
      setIsParsingPdf(false);
      if (pdfFileInputRef.current) pdfFileInputRef.current.value = "";
    }
  };

  const triggerAnalyzeFile = async (file: File, instructions: string) => {
    setIsParsingPdf(true);
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    
    if (isPdf && file.size > 4.5 * 1024 * 1024) {
      setIsParsingPdf(false);
      requestConfirm(
        "File PDF molto grande ⚠️",
        `Il file selezionato è molto grande (${(file.size / 1024 / 1024).toFixed(1)} MB). I file PDF superiori a 4.5 MB possono causare errori di caricamento per via dei limiti di traffico del server.\n\nTi consigliamo di:\n1) Comprimere il PDF online.\n2) Oppure fare uno screenshot della tabella e caricare l'immagine così ottenuta (le immagini vengono ottimizzate e compresse automaticamente sul client a pochissimi KB e caricate all'istante!).\n\nVuoi comunque provare a caricarlo?`,
        "Carica comunque",
        () => {
          proceedWithUpload(file, instructions);
        },
        'warning'
      );
    } else {
      await proceedWithUpload(file, instructions);
    }
  };

  const handlePdfUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
    const isImage = file.type.startsWith("image/") || file.name.endsWith(".png") || file.name.endsWith(".jpg") || file.name.endsWith(".jpeg");

    if (!isPdf && !isImage) {
      showToast("Seleziona un file PDF o un'immagine (JPEG/PNG) valida!");
      return;
    }

    setSelectedPdfFile(file);
    setIsPdfModalOpen(true);
  };

  const getWhatsAppReport = () => {
    let report = '';
    
    machines.forEach(m => {
      if (m.assignedEmployees && m.assignedEmployees.length > 0) {
        const operatorsStr = m.assignedEmployees.join(', ');
        report += `• *${m.name}*: ${operatorsStr}\n`;
      }
    });

    if (!report.trim()) {
      return "Nessuna persona collegata alle macchine al momento.";
    }

    return report.trim();
  };

  const downloadTextReport = () => {
    try {
      const text = getWhatsAppReport().replace(/\*/g, '').replace(/_/g, '');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `programma_officina_${new Date().toISOString().split('T')[0]}.txt`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("Programma scaricato come file di testo!");
    } catch (e) {
      showToast("Errore durante il download del file.");
    }
  };

  const handleResetLayout = () => {
    requestConfirm(
      "Ripristina Piano",
      "Sei sicuro di voler ripristinare il piano originale della mappa? Questa azione rimuoverà tutti i dati correnti di staff e lavorazioni.",
      "Ripristina",
      () => {
        localStorage.removeItem('workshop_data_v2');
        localStorage.removeItem('workshop_employees_v2');
        
        const defaultMachines = MACHINE_LAYOUT.map(config => ({
          id: config.id,
          name: config.name,
          type: config.type,
          assignedEmployees: [],
          currentJob: '',
          processTime: '',
          notes: '',
          priority: Priority.LOW,
          status: MachineStatus.FERMA
        }));
        setMachines(defaultMachines);
        setEmployees(INITIAL_EMPLOYEES);
      }
    );
  };

  const closeMobileSidebar = () => {
    setIsSidebarOpen(false);
    setActiveTab('map');
  };

  const selectedMachine = machines.find(m => m.id === selectedMachineId);
  const activeJobsCount = machines.filter(m => m.currentJob && m.type === 'machine').length;
  const busyEmployees = useMemo(() => Array.from(new Set(machines.flatMap(m => m.assignedEmployees))), [machines]);
  const filteredEmployees = employees.filter(emp => emp.name.toLowerCase().includes(searchTerm.toLowerCase()));

  // Generates 40 background cells representing the floor layout system with walls matching the hand-drawn sketch (emerald borders).
  const backgroundCells = useMemo(() => {
    const list = [];
    for (let r = 1; r <= 8; r++) {
      for (let c = 1; c <= 5; c++) {
        let borderClasses = '';
        let isWalkable = false;

        // Walkable inner area vs empty outer workspace areas
        if (r === 1 && c <= 4) isWalkable = true;
        if (r === 2 && c <= 3) isWalkable = true;
        if (r === 3 && c >= 4) isWalkable = true;
        if (r === 4 && c >= 3) isWalkable = true;
        if (r >= 5) isWalkable = true;

        // Visual emerald walls simulating the hand-drawn schema markers
        // 1. Top Outer Boundary
        if (r === 1 && c <= 4) {
          borderClasses += ' border-t-[3px] border-emerald-500';
        }
        // 2. Right Outer Boundary
        if (c === 5 && r >= 2) {
          borderClasses += ' border-r-[3px] border-emerald-500';
        }
        if (r === 1 && c === 4) {
          borderClasses += ' border-r-[3px] border-emerald-500';
        }
        // 3. Bottom Outer Boundary
        if (r === 8) {
          borderClasses += ' border-b-[3px] border-emerald-500';
        }
        // 4. Left Outer Boundary
        if ((r === 1 || r === 2) && c === 1) {
          borderClasses += ' border-l-[3px] border-emerald-500';
        }
        if (r >= 5 && c === 1) {
          borderClasses += ' border-l-[3px] border-emerald-500';
        }

        // 5. Custom Inner Partition Walls
        // Under row 2, Cols 1, 2, 3 (bottom-left area indentation wall)
        if (r === 2 && c <= 3) {
          borderClasses += ' border-b-[3px] border-emerald-500';
        }
        // Separation line right of CLT 20 (separating column 3 from column 4 passage in row 2)
        if (r === 2 && c === 3) {
          borderClasses += ' border-r-[3px] border-emerald-500';
        }
        // Vertical line on row 3 column 4 (left of CLT 6, separating from the upper left outside blank)
        if (r === 3 && c === 4) {
          borderClasses += ' border-l-[3px] border-emerald-500';
        }
        // Walkway above Row 4 Col 3 (where lower room expands to the left)
        if (r === 4 && c === 3) {
          borderClasses += ' border-t-[3px] border-l-[3px] border-emerald-500';
        }
        // Upper wall above CLT 17 and row 5 column 1/2 walkway
        if (r === 5 && c <= 2) {
          borderClasses += ' border-t-[3px] border-emerald-500';
        }

        list.push({ row: r, col: c, borderClasses, isWalkable });
      }
    }
    return list;
  }, []);

  return (
    <>
      <div className="min-h-screen bg-slate-100 flex flex-col h-screen overflow-hidden text-slate-900 print:hidden">
        <input type="file" ref={fileInputRef} onChange={importData} accept=".json" className="hidden" />
        <input type="file" ref={pdfFileInputRef} onChange={handlePdfUpload} accept=".pdf,image/*" className="hidden" />
      <header className="bg-white border-b px-4 md:px-6 py-3 z-40 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-600 p-2 rounded-xl shadow-lg shadow-emerald-200">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-base md:text-xl font-black tracking-tight leading-none uppercase">Planner Officina</h1>
              {syncStatus === 'syncing' && (
                <span className="inline-flex items-center bg-amber-50 text-amber-700 text-[8.5px] font-black px-1.5 py-0.5 rounded-md border border-amber-200 uppercase tracking-wider animate-pulse select-none">
                  Sincronizzazione
                </span>
              )}
              {syncStatus === 'synced' && (
                <span className="inline-flex items-center bg-emerald-50 text-emerald-700 text-[8.5px] font-black px-1.5 py-0.5 rounded-md border border-emerald-200 uppercase tracking-wider select-none" title="Tutti i dati sono salvati al sicuro sul server centralizzato">
                  Cloud • Attivo ☁️
                </span>
              )}
              {syncStatus === 'error' && (
                <span className="inline-flex items-center bg-rose-50 text-rose-700 text-[8.5px] font-black px-1.5 py-0.5 rounded-md border border-rose-200 uppercase tracking-wider select-none" title="Salvataggio offline temporaneo. Riprova più tardi">
                  Solo Locale ⚠️
                </span>
              )}
            </div>
            <span className="text-[9px] md:hidden font-bold text-slate-400 mt-1 uppercase">
              {activeTab === 'map' ? `Vista ${viewMode === 'map' ? 'Mappa' : 'Elenco'}` : activeTab === 'employees' ? 'Gestione Staff' : 'Menu Strumenti'}
            </span>
          </div>
        </div>

        {/* Action button row - ONLY visible on desktop/tablet to prevent mobile header congestion */}
        <div className="hidden md:flex items-center gap-2 md:gap-4">
          <button 
            onClick={() => setIsInstallModalOpen(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-xs font-black uppercase transition-all shadow-md active:scale-95"
            title="Installa questa applicazione sul tuo smartphone come un'app classica per eliminare problemi di connessione"
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span>Installa su Telefono 📲</span>
          </button>

          <button 
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-xs font-black uppercase transition-all shadow-md active:scale-95"
            title="Visualizza, copia o scarica il piano di lavoro corrente per il cellulare"
          >
            <svg className="w-4 h-4 text-indigo-150" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Scarica / Condividi 📥</span>
          </button>

          <button 
            onClick={() => setIsShareModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-black uppercase transition-all shadow-md active:scale-95"
            title="Invia la tua pianificazione o l'elenco degli operatori al tuo cellulare"
          >
            <svg className="w-4 h-4 text-blue-105" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span>Invia al Telefono</span>
          </button>

          <button 
            onClick={exportToExcel}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-black uppercase transition-all shadow-md active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            <span>Esporta Excel</span>
          </button>

          <button 
            onClick={handleResetLayout}
            className="flex items-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-2 rounded-lg text-xs font-black uppercase transition-all shadow-sm active:scale-95"
            title="Resetta la disposizione delle macchine con i dati iniziali"
          >
            <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 6.5" />
            </svg>
            <span>Resetta Piano</span>
          </button>
          
          <div className="h-8 w-px bg-slate-200"></div>
          
          <div className="flex items-center gap-1">
            <button onClick={exportData} title="Backup JSON" className="p-2 text-slate-400 hover:text-emerald-600 rounded-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></button>
            <button onClick={() => fileInputRef.current?.click()} title="Importa JSON" className="p-2 text-slate-400 hover:text-emerald-600 rounded-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg></button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar - w-full on mobile when tab is selected, slides beautifully */}
        <aside className={`
          fixed md:relative inset-y-0 left-0 z-50 w-full md:w-72 bg-white border-r flex flex-col shadow-2xl md:shadow-none transition-transform duration-300 transform
          ${isSidebarOpen || activeTab === 'employees' ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          md:flex shrink-0
        `}>
          <div className="p-4 border-b space-y-4 bg-slate-50">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Gestione Personale</h2>
              <button className="md:hidden p-2 text-slate-400" onClick={closeMobileSidebar}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <form onSubmit={handleAddEmployee} className="flex gap-2">
              <input type="text" placeholder="Aggiungi nome..." className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-medium text-slate-850" value={newEmployeeName} onChange={(e) => setNewEmployeeName(e.target.value)} />
              <button type="submit" title="Aggiungi operatore" className="bg-emerald-600 text-white p-2 rounded-lg hover:bg-emerald-700 transition-all shadow-sm active:scale-95"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg></button>
            </form>
            
            <div className="relative">
              <input type="text" placeholder="Cerca operatore..." className="w-full pl-8 pr-4 py-2 bg-white border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              <svg className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>

            {/* Dedicated action button to remove employees who are not assigned anywhere (absent for today) */}
            <button
              type="button"
              onClick={handleRemoveFreeEmployees}
              className="w-full py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-200 hover:border-rose-300 rounded-lg text-[11px] font-bold uppercase transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 duration-150"
              title="Elimina tutti gli operatori liberi (quelli che oggi non sono assegnati a nessuna macchina)"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Cancella Assenti / Liberi ({employees.filter(emp => !busyEmployees.includes(emp.name)).length})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {filteredEmployees.map((emp) => {
              const assignedTo = machines.filter(m => m.assignedEmployees.includes(emp.name));
              const busyCount = assignedTo.length;
              const isBusy = busyCount > 0;
              return (
                <div 
                  key={emp.id} 
                  draggable 
                  onDragStart={(e) => e.dataTransfer.setData('employeeName', emp.name)} 
                  onClick={() => {
                    setQuickAssignOperator(emp.name);
                    setActiveTab('map');
                    setIsSidebarOpen(false);
                    showToast(`Selezionato ${emp.name}: ora tocca il macchinario per assegnarlo!`);
                  }}
                  className={`group p-3 rounded-xl border-2 flex items-center justify-between gap-3 select-none transition-all cursor-pointer hover:border-blue-400 active:bg-blue-50/55 ${isBusy ? busyCount > 1 ? 'bg-amber-50/75 border-amber-200' : 'bg-emerald-50/75 border-emerald-100' : 'bg-white border-slate-100 shadow-sm hover:border-slate-200'}`}
                  title="Trascina sulla macchina o tocca qui per attivare l'assegnazione rapida touch"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${isBusy ? busyCount > 1 ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{emp.name.charAt(0)}</div>
                    <div className="min-w-0 flex-1 font-sans">
                      <p className="text-sm font-bold truncate text-slate-800">{emp.name}</p>
                      {isBusy ? (
                        <div className="space-y-0.5">
                          <p className={`text-[9.5px] font-black uppercase tracking-wider ${busyCount > 1 ? 'text-amber-700' : 'text-emerald-700'} flex items-center gap-1`}>
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${busyCount > 1 ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`}></span>
                            <span>{busyCount} {busyCount === 1 ? 'Macchina' : 'Macchine'}</span>
                          </p>
                          <p className="text-[9px] font-bold text-slate-500 truncate lowercase">
                            su: <span className="font-mono bg-slate-100/90 border border-slate-200 px-1 rounded uppercase font-semibold text-[8px]">{assignedTo.map(m => m.name).join(', ')}</span>
                          </p>
                        </div>
                      ) : (
                        <p className="text-[9.5px] font-black uppercase tracking-wider text-slate-400">Libero • (Tocca o Trascina)</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="hidden group-hover:inline-block text-[9px] bg-blue-100 text-blue-800 px-2 py-1 rounded-lg font-black uppercase tracking-wide">Tocca</span>
                    <button 
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleRemoveEmployeeFromStaff(emp.id, emp.name);
                      }} 
                      title="Elimina operatore" 
                      className="p-1.5 text-slate-400 hover:text-red-650 hover:bg-rose-50 rounded-lg transition-all active:scale-90"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="p-4 md:hidden">
            <button onClick={closeMobileSidebar} className="w-full py-3 bg-slate-900 text-white font-black rounded-xl text-xs uppercase shadow-lg">Torna al Piano</button>
          </div>
        </aside>

        {/* Overlay Mobile */}
        {(isSidebarOpen || (activeTab === 'employees' && window.innerWidth < 768)) && (
          <div className="fixed inset-0 bg-slate-900/40 z-40 md:hidden backdrop-blur-sm" onClick={closeMobileSidebar}></div>
        )}

        {/* Dynamic Responsive Workspace View */}
        <main className={`flex-1 overflow-auto bg-slate-100 p-2 md:p-6 transition-all ${activeTab === 'employees' ? 'hidden md:block' : 'block'}`}>
          <div className="max-w-[1400px] mx-auto min-w-full">
            
            {/* DAILY SCHEDULING PLANNER & SHIFT LEADERS WIDGET */}
            {activeTab !== 'employees' && (
              <div id="daily-scheduler-banner" className="bg-slate-900 border border-slate-800 text-slate-100 rounded-2xl p-4 md:p-5 mb-5 shadow-lg flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-5 transition-all">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 p-3 rounded-xl shadow-inner shrink-0 hidden sm:block animate-pulse">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Pianificazione Giornaliera</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-2">
                      <span className="text-xs font-black text-slate-300 uppercase tracking-wide">Capoturni di oggi:</span>
                      {shiftLeaders && shiftLeaders.length > 0 && shiftLeaders.some(s => s && s !== 'Da assegnare') ? (
                        shiftLeaders.map((leader, index) => (
                          <span key={index} className="text-xs font-black bg-amber-500 text-slate-950 px-2.5 py-0.5 rounded-lg uppercase tracking-wide shadow-sm">
                            👤 {leader}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs italic text-slate-400 font-medium">Nessuno impostato. Carica il PDF o inserisci i nomi.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap sm:flex-nowrap gap-3 items-center shrink-0">
                  {/* Manual trigger to change shift leaders */}
                  <button
                    type="button"
                    onClick={() => {
                      const leader1 = prompt("Inserisci il nome del primo Capoturno (Mattina/Primo Turno):", shiftLeaders[0] && shiftLeaders[0] !== 'Da assegnare' ? shiftLeaders[0] : "");
                      if (leader1 === null) return;
                      const leader2 = prompt("Inserisci il nome del secondo Capoturno (Pomeriggio/Secondo Turno):", shiftLeaders[1] && shiftLeaders[1] !== 'Da assegnare' ? shiftLeaders[1] : "");
                      if (leader2 === null) return;
                      setShiftLeaders([leader1.trim() || 'Da assegnare', leader2.trim() || 'Da assegnare']);
                      showToast("Capoturni della giornata aggiornati correttamente.");
                    }}
                    className="w-full sm:w-auto text-[10.5px] font-extrabold text-slate-300 border border-slate-750 hover:border-slate-700 bg-slate-950 hover:bg-slate-800/80 px-3.5 py-2.5 rounded-xl transition-all uppercase tracking-wider active:scale-95 text-center cursor-pointer"
                  >
                    ✏️ Modifica Capoturni
                  </button>

                  {/* Share and download current finalized schedule */}
                  <button
                    type="button"
                    onClick={() => setIsExportModalOpen(true)}
                    className="w-full sm:w-auto text-[10.5px] font-extrabold text-white border border-indigo-700 bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2.5 rounded-xl transition-all uppercase tracking-wider active:scale-95 text-center cursor-pointer shadow-md shadow-indigo-900/30 font-black"
                  >
                    📤 Scarica / Condividi
                  </button>

                  {/* AI PDF Upload Trigger */}
                  <button
                    type="button"
                    onClick={() => pdfFileInputRef.current?.click()}
                    disabled={isParsingPdf}
                    className={`w-full sm:w-auto bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 hover:shadow-lg hover:shadow-amber-500/10 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-95 duration-100 ${
                      isParsingPdf ? 'opacity-65 cursor-not-allowed animate-pulse' : 'cursor-pointer shadow-md'
                    }`}
                  >
                    {isParsingPdf ? (
                      <>
                        <svg className="w-4 h-4 animate-spin text-slate-950" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Elaborazione...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 text-slate-950" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 12v8m8-8v8m-8-4h8m-8-4h8m1.293-2.707l2.586-2.586a1 1 0 011.414 0l2.586 2.586A1 1 0 0120.707 9l-4.293 4.293a1 1 0 01-1.414 0L10.707 9a1 1 0 011.293-1.707z" />
                        </svg>
                        <span>Importa PDF / Foto Programma 📂</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
            
            {/* CARICO OPERATORI / STAFF ASSIGNMENTS SUMMARY PANEL */}
            {activeTab === 'map' && (
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 md:p-5 mb-5 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">📊</span>
                    <div>
                      <h3 className="text-xs md:text-sm font-black uppercase text-slate-800 tracking-tight leading-none">Riepilogo Carico Operatori</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Stato caricamento e postazioni assegnate in tempo reale</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-black uppercase text-slate-500">
                    <div>Attivi: <span className="text-emerald-700 font-mono bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-150">{busyEmployees.length}</span></div>
                    <div>Liberi: <span className="text-amber-700 font-mono bg-amber-50 px-1.5 py-0.5 rounded border border-amber-150">{employees.filter(emp => !busyEmployees.includes(emp.name)).length}</span></div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {employees.map((emp) => {
                    const assignedTo = machines.filter(m => m.assignedEmployees.includes(emp.name));
                    const count = assignedTo.length;
                    const isBusy = count > 0;

                    return (
                      <div 
                        key={emp.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                          isBusy 
                            ? count > 1 
                              ? 'bg-amber-50 border-amber-250 text-amber-900 shadow-sm shadow-amber-50/50'
                              : 'bg-emerald-50 border-emerald-250 text-emerald-900 shadow-sm shadow-emerald-50/50'
                            : 'bg-slate-50 border-slate-200 text-slate-400'
                        }`}
                        title={isBusy ? `Assegnato a: ${assignedTo.map(m => m.name).join(', ')}` : 'Nessuna macchina assegnata'}
                      >
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          isBusy 
                            ? count > 1 
                              ? 'bg-amber-500 animate-pulse'
                              : 'bg-emerald-500'
                            : 'bg-slate-300'
                        }`} />
                        <div>
                          <span className="font-extrabold pb-0.5 inline-block">{emp.name}</span>
                          {isBusy ? (
                            <span className="text-[10px] block opacity-95">
                              {count} {count === 1 ? 'macchina' : 'macchine'} <span className="font-mono bg-white/70 px-1.5 py-0.5 rounded border border-slate-200 uppercase font-black tracking-normal text-[8.5px] ml-1 select-all">{assignedTo.map(m => m.name).join(', ')}</span>
                            </span>
                          ) : (
                            <span className="text-[9.5px] block text-slate-400 font-medium italic">Libero / Non assegnato</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {employees.length === 0 && (
                    <p className="text-xs text-slate-400 italic py-1">Nessun operatore presente nello staff. Aggiungi il personale dal menù a sinistra.</p>
                  )}
                </div>
              </div>
            )}
            
            {/* View Switching & Quick Assign Bar - highly styled scroll control for mobile */}
            {activeTab === 'map' && (
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center mb-4 gap-3 bg-white p-3 rounded-2xl border border-slate-200/60 shadow-sm">
                <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl self-start">
                  <button
                    onClick={() => setViewMode('map')}
                    className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-1.5 ${
                      viewMode === 'map' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 20l-5.447-2.724A2 2 0 013 15.382V5.618a2 2 0 011.106-1.789L9 1.106l5.447 2.724A2 2 0 0115 5.618v9.764a2 2 0 01-1.106 1.789L9 20z"/></svg>
                    <span>Mappa Planimetria</span>
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-1.5 ${
                      viewMode === 'list' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    <span>Lista Rapida ({machines.length})</span>
                  </button>
                </div>

                {quickAssignOperator && (
                  <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-3.5 py-1.5 rounded-xl animate-pulse">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                      <p className="text-xs font-black uppercase leading-none">Assegna: <span className="text-amber-950 font-black underline">{quickAssignOperator}</span></p>
                    </div>
                    <button
                      onClick={() => {
                        setQuickAssignOperator(null);
                        showToast("Assegnazione rapida annullata");
                      }}
                      className="p-1 hover:bg-amber-100 rounded-full text-amber-900 relative active:scale-90"
                      title="Annulla assegnazione rapida"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* MAP CONFIGURATION TAB */}
            {activeTab === 'map' && viewMode === 'map' && (
              <div className="bg-white/60 md:backdrop-blur-md rounded-2xl md:rounded-[3rem] p-4 md:p-10 shadow-xl border border-white/80 overflow-x-auto custom-scrollbar">
                
                {/* Drag / Scroll prompt for smaller devices in map view */}
                <div className="md:hidden text-[10px] font-black text-slate-400 text-center mb-3 flex items-center justify-center gap-1.5">
                  <svg className="w-4 h-4 animate-bounce text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                  SCORRI ORIZZONTALMENTE LA PLANIMETRIA PER VEDERE TUTTA L'OFFICINA
                </div>

                {/* Floor Plan Parent grid container */}
                <div 
                  className="grid grid-cols-5 gap-2 md:gap-4 min-w-[700px] md:min-w-0 relative"
                  style={{ gridTemplateRows: 'repeat(8, minmax(110px, auto))' }}
                >
                  {/* 1. Underlying architectural layout walkways, grids, and boundaries mirroring the sketch */}
                  {backgroundCells.map((cell, idx) => (
                    <div
                      key={`bg-${idx}`}
                      style={{ gridColumnStart: cell.col, gridRowStart: cell.row }}
                      className={`w-full h-full min-h-[110px] md:min-h-[130px] transition-all duration-200 relative ${cell.borderClasses} ${cell.isWalkable ? 'bg-slate-50/60' : 'bg-slate-250/20'}`}
                    >
                      {!cell.isWalkable && (
                        <div className="w-full h-full bg-[radial-gradient(#e2e8f0_1.5px,transparent_1.5px)] [background-size:12px_12px] opacity-70"></div>
                      )}
                      {cell.isWalkable && (
                        <div className="absolute right-1 bottom-1 text-[8px] font-black text-slate-300 opacity-30 select-none">
                          R{cell.row} C{cell.col}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* 2. Interactive machine cards layered exactly above our architectural walkways */}
                  {MACHINE_LAYOUT.map((config) => {
                    const data = machines.find(m => m.id === config.id);
                    if (!data) return null;
                    return (
                      <div 
                        key={config.id} 
                        style={{ gridColumnStart: config.col, gridRowStart: config.row }}
                        className="z-10"
                      >
                        <MachineCard 
                          data={data} 
                          config={config} 
                          onClick={() => {
                            if (quickAssignOperator) {
                              handleDropEmployee(data.id, quickAssignOperator);
                              setQuickAssignOperator(null);
                            } else {
                              setSelectedMachineId(data.id);
                            }
                          }} 
                          onDropEmployee={(name) => handleDropEmployee(data.id, name)} 
                          onRemoveEmployee={(name) => handleRemoveEmployeeFromMachine(data.id, name)} 
                          onToggleStatus={() => handleToggleMachineStatus(data.id)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* LIST CONFIGURATION TAB - EXTREMELY SUITABLE AND CONVENIENT FOR MOBILE RUNTIMES */}
            {activeTab === 'map' && viewMode === 'list' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {machines.map((machine) => {
                  const isBusy = machine.currentJob || machine.assignedEmployees.length > 0;
                  return (
                    <div
                      key={machine.id}
                      onClick={() => {
                        if (quickAssignOperator) {
                          handleDropEmployee(machine.id, quickAssignOperator);
                          setQuickAssignOperator(null);
                        } else {
                          setSelectedMachineId(machine.id);
                        }
                      }}
                      className={`p-4 bg-white rounded-2xl border-2 shadow-sm flex flex-col gap-3 transition-all active:scale-[0.99] cursor-pointer ${
                        quickAssignOperator ? 'border-dashed border-amber-300 hover:border-amber-500 hover:bg-amber-50/20' : 'border-slate-150 hover:border-slate-200'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-extrabold text-sm text-slate-800">{machine.name}</h3>
                            <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-black uppercase tracking-tight">
                              {machine.id.toUpperCase()}
                            </span>
                          </div>
                          {machine.currentJob ? (
                            <p className="text-xs font-bold text-slate-650 mt-1">
                              Lavoro: <span className="text-slate-850 font-black">{machine.currentJob}</span>
                            </p>
                          ) : (
                            <p className="text-xs text-slate-400 italic mt-0.5">Nessuna lavorazione attiva / Libera</p>
                          )}
                        </div>
                        
                        {/* Status Toggle on Machine Cards for Quick Action */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleMachineStatus(machine.id);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border shrink-0 flex items-center gap-1.5 active:scale-90 hover:brightness-95 shadow-sm ${
                            machine.status === 'In Lavorazione' ? 'bg-emerald-500 text-white border-emerald-600' :
                            machine.status === 'Attrezzaggio' ? 'bg-amber-500 text-white border-amber-600' :
                            'bg-rose-500 text-white border-rose-600'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full bg-white shrink-0 ${machine.status !== 'Ferma' ? 'animate-pulse' : ''}`}></span>
                          <span>{machine.status === 'In Lavorazione' ? 'Lavoro' : machine.status || 'Ferma'}</span>
                        </button>
                      </div>

                      {/* Display assigned people with mobile deselect options */}
                      <div className="flex flex-wrap gap-1 items-center bg-slate-50 p-2 rounded-xl text-xs border border-slate-100">
                        <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black mr-1.5">Staff:</span>
                        {machine.assignedEmployees.length > 0 ? (
                          machine.assignedEmployees.map((emp, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-1 bg-white text-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold shadow-sm"
                            >
                              <span>{emp}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveEmployeeFromMachine(machine.id, emp);
                                }}
                                className="p-0.5 hover:bg-slate-100 rounded text-slate-450 hover:text-rose-600 active:scale-75 transition-all"
                                title="Rimuovi operatore"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-400 italic font-medium">Vuota (Tocca un operatore in "Staff" per assegnarlo qui)</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 border-t pt-2 mt-1">
                        <div className="flex items-center gap-1 font-bold text-slate-600">
                          {machine.processTime ? (
                            <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-lg text-[10px] uppercase font-mono">
                              ⏱️ {machine.processTime}
                            </span>
                          ) : (
                            <span className="italic text-slate-350 text-[10px] font-medium">Senza tempo stimato</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {machine.priority !== Priority.LOW && (
                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${
                              machine.priority === Priority.URGENT ? 'bg-red-50 text-red-750 border border-red-200' :
                              machine.priority === Priority.HIGH ? 'bg-orange-50 text-orange-750 border border-orange-200' : 
                              'bg-blue-50 text-blue-750 border border-blue-250'
                            }`}>
                              {machine.priority}
                            </span>
                          )}
                          <span className="text-blue-600 font-extrabold flex items-center gap-0.5 text-xs">
                            {quickAssignOperator ? 'Assegna Qui' : 'Gestisci'}
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                            </svg>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* MOBILE ONLY ACTIONS CENTER DASHBOARD */}
            {activeTab === 'menu' && (
              <div className="space-y-4 max-w-md mx-auto p-2">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60 space-y-4">
                  <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizzazione & Strumenti</h2>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {/* 0. Installa come App Classica */}
                    <button
                      onClick={() => setIsInstallModalOpen(true)}
                      className="flex items-center gap-4 bg-amber-500 hover:bg-amber-600 text-white p-4 rounded-xl text-left transition-all active:scale-95 shadow-md shadow-amber-100"
                    >
                      <div className="bg-white/15 p-2 rounded-lg">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-extrabold text-xs uppercase tracking-tight">Installa come App Classica 📲</p>
                        <p className="text-[10px] text-amber-100">Usa come app vera sul telefono, zero problemi offline</p>
                      </div>
                    </button>

                    {/* 1. Sincronizza telefono */}
                    <button
                      onClick={() => setIsShareModalOpen(true)}
                      className="flex items-center gap-4 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-xl text-left transition-all active:scale-95 shadow-md shadow-blue-100"
                    >
                      <div className="bg-white/15 p-2 rounded-lg">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-extrabold text-xs uppercase tracking-tight">Invia al Telefono (QR)</p>
                        <p className="text-[10px] text-blue-105">Sincronizza o mantieni aggiornato il tuo smartphone</p>
                      </div>
                    </button>

                    {/* 2. Esporta Excel */}
                    <button
                      onClick={exportToExcel}
                      className="flex items-center gap-4 bg-emerald-600 hover:bg-emerald-700 text-white p-4 rounded-xl text-left transition-all active:scale-95 shadow-md shadow-emerald-100"
                    >
                      <div className="bg-white/15 p-2 rounded-lg">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-extrabold text-xs uppercase tracking-tight">Esporta Piano Lavoro (Excel)</p>
                        <p className="text-[10px] text-emerald-100">Scarica file CSV compatibile con Excel o Calc</p>
                      </div>
                    </button>

                    {/* 3. Scarica / Condividi Programma */}
                    <button
                      onClick={() => setIsExportModalOpen(true)}
                      className="flex items-center gap-4 bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-xl text-left transition-all active:scale-95 shadow-md shadow-indigo-100"
                    >
                      <div className="bg-white/15 p-2 rounded-lg">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-extrabold text-xs uppercase tracking-tight">Scarica / Condividi Programma</p>
                        <p className="text-[10px] text-indigo-105">PDF da stampare, copia WhatsApp o File di testo</p>
                      </div>
                    </button>

                    {/* 4. Ripristina Piano */}
                    <button
                      onClick={handleResetLayout}
                      className="flex items-center gap-4 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 p-4 rounded-xl text-left transition-all active:scale-95"
                    >
                      <div className="bg-rose-500 text-white p-2 rounded-lg">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 6.5" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-extrabold text-xs uppercase tracking-tight">Ripristina Layout di Fabbrica</p>
                        <p className="text-[10px] text-rose-500">Ripristina operatori e planimetria iniziale</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Backup e Carica JSON */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60 space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Backup & Ripristino database</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={exportData}
                      className="flex flex-col items-center justify-center p-4 bg-slate-50 border border-slate-150 hover:bg-slate-100 rounded-xl transition-all active:scale-95 text-center gap-2 font-black text-[10px] text-slate-600 uppercase"
                    >
                      <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Esporta Backup
                    </button>

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center justify-center p-4 bg-slate-50 border border-slate-150 hover:bg-slate-100 rounded-xl transition-all active:scale-95 text-center gap-2 font-black text-[10px] text-slate-600 uppercase"
                    >
                      <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Importa Backup
                    </button>
                  </div>
                </div>

                {/* Dashboard stats panel */}
                <div className="bg-slate-950 text-white rounded-2xl p-5 shadow-md space-y-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Statistiche Officina Correnti</p>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                      <p className="text-xl font-black text-blue-400">{activeJobsCount}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Postazioni Lavoro</p>
                    </div>
                    <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                      <p className="text-xl font-black text-emerald-400">{busyEmployees.length}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Staff Impiegato</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Stats - bottom of main page */}
            {activeTab === 'map' && (
              <div className="mt-4 flex justify-center gap-6 text-[10px] font-black uppercase text-slate-400">
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded bg-blue-500"></div> Lavori Attivi: {activeJobsCount}</div>
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded bg-emerald-500"></div> Staff Occupato: {busyEmployees.length}</div>
              </div>
            )}
            
          </div>
        </main>
      </div>

      {/* Bottom Nav Mobile - extended tabs with centralized Actions Center */}
      <nav className="md:hidden bg-white border-t px-6 py-2 flex justify-around items-center z-40 shadow-lg">
        <button 
          onClick={() => { setActiveTab('map'); setIsSidebarOpen(false); }} 
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'map' ? 'text-blue-600 scale-105 font-black' : 'text-slate-400'}`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 20l-5.447-2.724A2 2 0 013 15.382V5.618a2 2 0 011.106-1.789L9 1.106l5.447 2.724A2 2 0 0115 5.618v9.764a2 2 0 01-1.106 1.789L9 20z"/></svg>
          <span className="text-[10px] font-bold uppercase">Mappa</span>
        </button>
        <button 
          onClick={() => { setActiveTab('employees'); setIsSidebarOpen(false); }} 
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'employees' ? 'text-blue-600 scale-105 font-black' : 'text-slate-400'}`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
          <span className="text-[10px] font-bold uppercase">Staff</span>
        </button>
        <button 
          onClick={() => { setActiveTab('menu'); setIsSidebarOpen(false); }} 
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'menu' ? 'text-blue-600 scale-105 font-black' : 'text-slate-400'}`}
          title="Gestione strumenti e salvataggio"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-[10px] font-bold uppercase">Strumenti</span>
        </button>
      </nav>

      {selectedMachine && (
        <MachineDetailModal machine={selectedMachine} employees={employees} onClose={() => setSelectedMachineId(null)} onSave={handleUpdateMachine} />
      )}

      {isShareModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 my-8 animate-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <h3 className="text-sm font-black uppercase tracking-wider">Invia / Sincronizza Telefono</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setIsShareModalOpen(false)}
                className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto font-sans">
              <p className="text-xs text-slate-500 leading-relaxed">
                Il computer salva gli operatori inseriti, i lavori e la disposizione delle macchine solo a livello locale su questo browser. Usa questa funzione per inviare o copiare la configurazione corrente direttamente sul tuo smartphone!
              </p>

              {/* QR Code Section */}
              <div className="flex flex-col sm:flex-row items-center gap-6 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                <div className="bg-white p-2 rounded-xl border border-slate-200 shrink-0 shadow-sm">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(getSyncLink())}`} 
                    alt="QR Code" 
                    className="w-[140px] h-[140px] md:w-[160px] md:h-[160px]"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="space-y-2 text-center sm:text-left">
                  <span className="inline-block bg-blue-105 text-blue-800 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-blue-200">
                    Sincronizzazione Rapida
                  </span>
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Inquadra con il Cellulare</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Apri la fotocamera del tuo cellulare, inquadra il codice QR a sinistra e tocca sul link rilevato. L'app si aprirà sul telefono chiedendoti se desideri importare tutti i tuoi operatori all'istante!
                  </p>
                </div>
              </div>

              {/* Copyable manual Link */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Link diretto di condivisione</h4>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    readOnly 
                    value={getSyncLink()} 
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-600 truncate" 
                  />
                  <button 
                    type="button" 
                    onClick={handleCopyLink}
                    className={`px-3.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-sm shrink-0 flex items-center justify-center gap-1.5 active:scale-95 ${
                      copiedLink 
                        ? 'bg-emerald-600 text-white' 
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {copiedLink ? (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                        </svg>
                        Copiato
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                        Copia
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  Copia il link e inviatelo tramite WhatsApp, Telegram o via email per aprirlo comodamente sul telefono.
                </p>
              </div>

              {/* Install guide for mobile screen */}
              <div className="border-t pt-4 space-y-3">
                <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-emerald-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                  </svg>
                  Come salvare l'applicazione sul tuo Schermo
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] text-slate-600">
                  <div className="bg-slate-50/50 p-3 rounded-lg border border-slate-100 space-y-1">
                    <p className="font-extrabold text-slate-800">📱 Su Android (Chrome):</p>
                    <ol className="list-decimal pl-4 space-y-0.5 text-slate-500">
                      <li>Apri il link sincronizzato nel browser.</li>
                      <li>Tocca i 3 puntini in alto a destra.</li>
                      <li>Tocca <strong className="text-slate-700">"Aggiungi a schermata Home"</strong>.</li>
                    </ol>
                  </div>
                  <div className="bg-slate-50/50 p-3 rounded-lg border border-slate-100 space-y-1">
                    <p className="font-extrabold text-slate-800">🍏 Su iPhone (Safari):</p>
                    <ol className="list-decimal pl-4 space-y-0.5 text-slate-500">
                      <li>Apri il link sincronizzato su Safari.</li>
                      <li>Tocca il pulsante <strong className="text-slate-705">Condividi</strong> (icona quadrata con freccia in su).</li>
                      <li>Usa l'opzione <strong className="text-slate-700">"Aggiungi alla schermata Home"</strong>.</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-slate-50 px-6 py-4 border-t flex justify-end">
              <button 
                type="button" 
                onClick={() => setIsShareModalOpen(false)}
                className="bg-slate-900 hover:bg-slate-850 text-white px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider shadow-sm active:scale-95"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAILED PWA INSTALLATION DIALOG – "INSTALLA COME APP CLASSICA" */}
      {isInstallModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-100 my-8 animate-in zoom-in-95 duration-150 text-slate-800">
            <header className="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <div>
                  <h3 className="text-sm md:text-base font-black uppercase tracking-wider leading-none">Installa come App Classica 📲</h3>
                  <p className="text-[10px] text-amber-100 uppercase font-semibold mt-1">Niente più problemi di connessione o scorrimento</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsInstallModalOpen(false)}
                className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </header>

            <div className="p-6 space-y-6 max-h-[72vh] overflow-y-auto font-sans">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 space-y-2 leading-relaxed">
                <p className="font-extrabold flex items-center gap-1.5 text-amber-950 uppercase text-[11px] tracking-tight">
                  <span>💡 Perché installare il Planner sul telefono?</span>
                </p>
                <ul className="list-disc pl-4 space-y-1 text-amber-900/95 font-medium">
                  <li><strong>Bypass offline intelligente:</strong> L'applicazione si avvia all'istante anche se ti trovi in una zona con poco campo o senza internet, caricando l'ultimo stato salvato.</li>
                  <li><strong>Esperienza a tutto schermo:</strong> Rimuove la barra degli indirizzi di Safari o Chrome, facendola apparire al 100% come un'applicazione installata sul telefono.</li>
                  <li><strong>Sincronizzazione Cloud Automatica:</strong> Ogni modifica fatta sul computer d'officina o sul telefono si sincronizza automaticamente sul database centrale.</li>
                </ul>
              </div>

              {/* QR Code section for instant opening */}
              <div className="flex flex-col sm:flex-row items-center gap-6 bg-slate-50 p-4 border border-slate-200 rounded-2xl">
                <div className="bg-white p-2 rounded-xl border border-slate-200 shrink-0 shadow-sm">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(getSyncLink())}`} 
                    alt="QR Code" 
                    className="w-[120px] h-[120px]"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="space-y-2 text-center sm:text-left flex-1">
                  <span className="inline-block bg-amber-50 text-amber-700 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-200">
                    Avvia sul telefono
                  </span>
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Cameria o scanner QR</h4>
                  <p className="text-xs text-slate-500 leading-normal">
                    Se sei davanti al PC, inquadra questo codice QR con la fotocamera del tuo cellulare per aprirla istantaneamente; poi segui i passaggi qui sotto per installarla.
                  </p>
                </div>
              </div>

              {/* Native install prompt button if browser detected beforeinstallprompt */}
              {deferredPrompt && (
                <div className="bg-gradient-to-r from-teal-50 to-emerald-50 border border-emerald-250 rounded-2xl p-5 flex flex-col items-center justify-between gap-3 text-center sm:text-left sm:flex-row shadow-sm shadow-emerald-50">
                  <div className="space-y-1">
                    <p className="font-extrabold text-[13px] text-emerald-950 uppercase tracking-tight flex items-center justify-center sm:justify-start gap-1.5">
                      <span>🎉 Installazione Istantanea</span>
                    </p>
                    <p className="text-xs text-emerald-800 leading-normal">
                      Il tuo dispositivo supporta lo scaricamento automatico a schermo intero sul desktop o sul telefono!
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleNativeInstall}
                    className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase px-5 py-3 rounded-xl shadow-md transition-all active:scale-95 shrink-0 flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <span>Installa Ora 📲</span>
                  </button>
                </div>
              )}

              {/* Operating System tabs */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Guida Installazione</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Android Instruction guide */}
                  <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200/60">
                      <span className="text-2xl">🤖</span>
                      <div>
                        <p className="font-extrabold text-sm text-slate-800 leading-none">Dispositivi Android</p>
                        <p className="text-[10px] text-slate-400 font-semibold mt-1 uppercase">Samsung, Xiaomi, Pixel, Oppo</p>
                      </div>
                    </div>
                    <ol className="list-decimal pl-4 text-xs text-slate-600 space-y-2 font-medium">
                      <li>Apri il link su <strong className="text-slate-800">Google Chrome</strong>.</li>
                      <li>Attendi il banner automatico di avviso in basso <strong className="text-amber-600">"Aggiungi a schermata Home"</strong> ed eseguilo.</li>
                      <li>Se non lo vedi, tocca i <strong className="text-slate-800">3 puntini</strong> in alto a destra.</li>
                      <li>Fai tap su <strong className="text-slate-800">"Installa applicazione"</strong> o il tasto <strong className="text-slate-800">"Aggiungi a schermata Home"</strong>.</li>
                      <li>Troverai l'app nella lista delle tue applicazioni sul cellulare!</li>
                    </ol>
                  </div>

                  {/* iOS Apple Instruction guide */}
                  <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200/60">
                      <span className="text-2xl">🍏</span>
                      <div>
                        <p className="font-extrabold text-sm text-slate-800 leading-none">Apple iPhone / iPad</p>
                        <p className="text-[10px] text-slate-400 font-semibold mt-1 uppercase">Sistema operativo iOS</p>
                      </div>
                    </div>
                    <ol className="list-decimal pl-4 text-xs text-slate-600 space-y-2 font-medium">
                      <li>Apri il link tassativamente su <strong className="text-slate-800">Safari</strong> (non su Chrome/Firefox).</li>
                      <li>Tocca il pulsante <strong className="text-slate-800">Condividi</strong> (<span className="bg-slate-200 px-1 py-0.5 rounded text-[10px]">📤</span> l'icona quadrata con la freccia in alto, in basso al centro).</li>
                      <li>Scorri l'elenco delle opzioni verso il basso.</li>
                      <li>Tocca la voce <strong className="text-indigo-600">"Aggiungi alla schermata Home"</strong> ➕.</li>
                      <li>In alto a destra, tocca <strong className="text-slate-800">"Aggiungi"</strong>. Da questo momento l'icona dell'app rimarrà sulla tua Home!</li>
                    </ol>
                  </div>
                </div>
              </div>

              {/* Copyable link */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Link diretto per il tuo telefono</h4>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    readOnly 
                    value={getSyncLink()} 
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-600 truncate" 
                  />
                  <button 
                    type="button" 
                    onClick={handleCopyLink}
                    className={`px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm shrink-0 flex items-center justify-center gap-1.5 active:scale-95 ${
                      copiedLink 
                        ? 'bg-emerald-600 text-white' 
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {copiedLink ? 'Copiato' : 'Copia'}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-4 border-t flex justify-end">
              <button 
                type="button" 
                onClick={() => setIsInstallModalOpen(false)}
                className="bg-slate-900 hover:bg-slate-850 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm active:scale-95 cursor-pointer"
              >
                Ho capito, chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXTREMELY HIGH UTILITY EXPORT & DOWNLOAD SCHEDULE DIALOG */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-100 my-8 animate-in zoom-in-95 duration-150 text-slate-850">
            <header className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <div>
                  <h3 className="text-sm md:text-base font-black uppercase tracking-wider leading-none">Scarica / Condividi Programma</h3>
                  <p className="text-[10px] text-indigo-105 uppercase font-semibold mt-1">Salva sul cellulare o invia ai collaboratori</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => {
                  setIsExportModalOpen(false);
                  setCopiedReport(false);
                }}
                className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-all text-slate-350"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </header>

            <div className="p-6 space-y-5 max-h-[72vh] overflow-y-auto font-sans">
              <p className="text-xs text-slate-500 leading-relaxed">
                Esporta la pianificazione corrente in formati pronti per essere salvati sul tuo cellulare, stampati o inoltrati ai tuoi operatori su WhatsApp/Telegram in modo chiaro e formattato.
              </p>

              {/* THREE QUICK METHODS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Method A: Print / Save to PDF */}
                <button
                  type="button"
                  onClick={() => {
                    window.print();
                  }}
                  className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-200 rounded-2xl transition-all active:scale-95 text-center gap-2.5 cursor-pointer group"
                >
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-4H7v4a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-tight">Salva in PDF / Stampa</h4>
                    <p className="text-[9.5px] text-slate-400 mt-1 leading-snug">Genera foglio A4 o PDF pulito sul telefono</p>
                  </div>
                </button>

                {/* Method B: Whatsapp Copy / Share */}
                <button
                  type="button"
                  onClick={() => {
                    try {
                      navigator.clipboard.writeText(getWhatsAppReport());
                      setCopiedReport(true);
                      showToast("Programma formattato copiato! Incollalo su WhatsApp.");
                      setTimeout(() => setCopiedReport(false), 3000);
                    } catch (err) {
                      showToast("Errore di copia automatica.");
                    }
                  }}
                  className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-emerald-50/50 border border-slate-200 hover:border-emerald-200 rounded-2xl transition-all active:scale-95 text-center gap-2.5 cursor-pointer group"
                >
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-all">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-tight">Copia WhatsApp</h4>
                    <p className="text-[9.5px] text-slate-400 mt-1 leading-snug">{copiedReport ? '🟢 Copiato nella clipboard!' : 'Genera testo con emoji, pronto da incollare'}</p>
                  </div>
                </button>

                {/* Method C: Download text file (.txt) */}
                <button
                  type="button"
                  onClick={downloadTextReport}
                  className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-amber-50/50 border border-slate-200 hover:border-amber-200 rounded-2xl transition-all active:scale-95 text-center gap-2.5 cursor-pointer group"
                >
                  <div className="p-3 bg-amber-50 text-amber-600 rounded-xl group-hover:bg-amber-600 group-hover:text-white transition-all">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-tight">Scarica File .txt</h4>
                    <p className="text-[9.5px] text-slate-400 mt-1 leading-snug">Salva come documento di testo semplice (.txt)</p>
                  </div>
                </button>
              </div>

              {/* Text report previewer */}
              <div className="space-y-2 pt-2 col-span-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Anteprima del Testo Generato</h4>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        navigator.clipboard.writeText(getWhatsAppReport());
                        setCopiedReport(true);
                        showToast("Copiato!");
                        setTimeout(() => setCopiedReport(false), 3000);
                      } catch (e) {}
                    }}
                    className="text-[10px] font-black text-indigo-600 hover:text-indigo-850 uppercase tracking-wider flex items-center gap-1 active:scale-95 cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span>{copiedReport ? 'Copiato ✔️' : 'Copia Testo'}</span>
                  </button>
                </div>
                <div className="relative bg-slate-900 rounded-2xl p-4 border border-slate-800 text-slate-100 max-h-[180px] overflow-y-auto style-scrollbar">
                  <pre className="font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap select-all">{getWhatsAppReport()}</pre>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  💡 <strong>Consiglio salvataggio PDF:</strong> Cliccando su "Salva in PDF / Stampa", si aprirà l'anteprima di stampa del tuo browser. Sul cellulare puoi selezionare "Salva come PDF" o "Crea PDF" nelle opzioni per salvarlo direttamente nella tua app File.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-4 border-t flex justify-end gap-2 shrink-0">
              <button 
                type="button" 
                onClick={() => {
                  setIsExportModalOpen(false);
                  setCopiedReport(false);
                }}
                className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm active:scale-95 cursor-pointer"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Sandbox-Friendly Dialog Confirmation Overlay */}
      {customConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-full shrink-0 ${
                  customConfirm.type === 'danger' 
                    ? 'bg-rose-50 text-rose-600' 
                    : customConfirm.type === 'warning'
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-emerald-50 text-emerald-600'
                }`}>
                  {customConfirm.type === 'danger' || customConfirm.type === 'warning' ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-slate-900 leading-6">{customConfirm.title}</h3>
                  <p className="mt-2 text-sm text-slate-500 whitespace-pre-line leading-relaxed break-words">{customConfirm.message}</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-4 flex flex-row-reverse gap-3 border-t">
              <button
                type="button"
                className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg text-white shadow-md transition-all active:scale-95 duration-100 ${
                  customConfirm.type === 'danger' 
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-100' 
                    : customConfirm.type === 'warning'
                      ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-100'
                      : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'
                }`}
                onClick={() => {
                  customConfirm.onConfirm();
                  setCustomConfirm(null);
                }}
              >
                {customConfirm.actionText}
              </button>
              <button
                type="button"
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-550 hover:bg-slate-200 hover:text-slate-800 rounded-lg transition-all"
                onClick={() => setCustomConfirm(null)}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXTREMELY POLISHED IA MULTIMODAL EXTRACTION DIALOG (WITH OPTIONAL EXTRACTION NOTE/USER INSTRUCTION) */}
      {isPdfModalOpen && selectedPdfFile && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150 text-slate-800">
            <header className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between shadow-md shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-amber-500 text-slate-950 p-2 rounded-xl">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9.663 17h4.673M12 3v1m6.364.364l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-extrabold text-sm md:text-base uppercase tracking-wider leading-none">Analisi Intelligente</h3>
                  <p className="text-[10px] text-slate-400 mt-1 uppercase font-black">Gemini 3.5-Flash Multimodale</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => {
                  setIsPdfModalOpen(false);
                  setSelectedPdfFile(null);
                  setPdfUserInstructions('');
                }}
                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-350 transition-all cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </header>

            <div className="p-6 overflow-y-auto space-y-5">
              {/* File Detail Panel */}
              <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl flex items-center gap-4">
                <div className={`p-3 rounded-xl shrink-0 ${
                  selectedPdfFile.type === "application/pdf" 
                    ? "bg-rose-55/15 text-rose-600 border border-rose-100/50" 
                    : "bg-blue-55/15 text-blue-600 border border-blue-105/50"
                }`}>
                  {selectedPdfFile.type === "application/pdf" ? (
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase font-black text-slate-400 tracking-wider">File caricato</p>
                  <p className="font-extrabold text-xs md:text-sm text-slate-800 truncate">{selectedPdfFile.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                    {(selectedPdfFile.size / 1024 / 1024).toFixed(2)} MB • {selectedPdfFile.type || "Programma"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => pdfFileInputRef.current?.click()}
                  className="bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-950 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap"
                >
                  Cambia
                </button>
              </div>

              {/* Extraction prompt/guideline field */}
              <div className="space-y-2">
                <label className="flex items-center justify-between text-xs font-black text-slate-700 uppercase tracking-wider">
                  <span>Istruzioni di Estrazione all'IA (Opzionale)</span>
                  <span className="text-[10px] text-amber-500 font-extrabold tracking-tight">Consiglia cosa cercare o ignorare</span>
                </label>
                <textarea
                  rows={3}
                  value={pdfUserInstructions}
                  onChange={(e) => setPdfUserInstructions(e.target.value)}
                  placeholder="Es: 'Leggi solo il turno di mattina', 'Ignora le macchine e importa solo lo staff', 'Mappa clt22 come clt-22', 'Assegna le lavorazioni escludendo il CLT 25'..."
                  className="w-full bg-slate-50 hover:bg-slate-50/50 focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 text-xs text-slate-800 placeholder-slate-400 transition-all font-semibold outline-none resize-none"
                />
                <p className="text-[10px] text-slate-400 leading-normal">
                  Invia una linea guida personale. Gemini regolerà la sua lettura dell'immagine o del PDF secondo quest'indicazione.
                </p>
              </div>

              {/* Visual explanation of multi-format support */}
              <div className="bg-indigo-50/65 border border-indigo-100/70 p-4 rounded-2xl flex items-start gap-3">
                <div className="text-indigo-600 mt-0.5">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-[11px] text-indigo-950 font-medium leading-relaxed">
                  <p className="font-extrabold text-indigo-950 uppercase tracking-wide mb-1 text-[10px]">Lettore Multimedale AI</p>
                  Ora puoi fotografare il foglio scritto col cellulare, caricarlo qui e farlo leggere all'IA con la stessa precisione di un PDF digitale!
                </div>
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-4 flex items-center justify-end gap-3 border-t shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsPdfModalOpen(false);
                  setSelectedPdfFile(null);
                  setPdfUserInstructions('');
                }}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-200 hover:text-slate-800 rounded-lg transition-all cursor-pointer"
                disabled={isParsingPdf}
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedPdfFile) {
                    triggerAnalyzeFile(selectedPdfFile, pdfUserInstructions);
                  }
                }}
                disabled={isParsingPdf}
                className={`bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-100 flex items-center gap-2 transition-all active:scale-95 duration-100 ${
                  isParsingPdf ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                }`}
              >
                {isParsingPdf ? (
                  <>
                    <svg className="w-4 h-4 animate-spin text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Analisi in corso...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Analizza con IA ⚡</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[200] max-w-sm w-[90%] bg-slate-900 border border-slate-800 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className="bg-emerald-500 p-1 rounded-full text-white shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-xs font-bold leading-snug">{toastMessage}</p>
        </div>
      )}
    </div>

    {/* SEZIONE SPECIALE PER LA STAMPA PDF - VISIBILE SOLO QUANDO SI ATTIVA WINDOW.PRINT() */}
    <div className="hidden print:block print-container bg-white p-8 font-sans text-slate-900 w-full min-h-screen">
      <div className="border border-slate-300 p-6 rounded-2xl mb-8 flex items-center justify-between bg-slate-50">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-slate-950">PROSPETTO GIORNALIERO OFFICINA</h1>
          <p className="text-sm font-bold text-slate-800 mt-1 uppercase">
            Data: {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Planner Officina Pro</span>
          <div className="mt-1 flex flex-col items-end gap-1">
            {shiftLeaders.filter(s => s && s !== 'Da assegnare').map((leader, idx) => (
              <span key={idx} className="text-xs font-extrabold bg-slate-950 text-white px-2.5 py-1 rounded-lg uppercase tracking-wide shadow-sm font-mono">
                👤 Capoturno: {leader}
              </span>
            ))}
          </div>
        </div>
      </div>

      <h2 className="text-xs font-black text-slate-950 uppercase border-b-2 border-slate-950 pb-2 mb-4">Centri Di Lavoro CNC & Pianificazioni Attive:</h2>
      
      <table className="w-full text-left border-collapse border border-slate-350">
        <thead>
          <tr className="bg-slate-100 text-slate-800 text-[10px] font-black uppercase tracking-wider">
            <th className="border border-slate-300 p-3 w-1/4">Macchina</th>
            <th className="border border-slate-300 p-3 w-1/12 font-bold select-none">Stato</th>
            <th className="border border-slate-300 p-3 w-1/5">Commessa / Lavoro</th>
            <th className="border border-slate-300 p-3 w-1/12">Tempo Lav.</th>
            <th className="border border-slate-300 p-3 w-1/4">Staff Assegnato</th>
            <th className="border border-slate-300 p-3">Note Operative</th>
          </tr>
        </thead>
        <tbody className="text-[11px] font-semibold text-slate-800">
          {machines.map(m => {
            const hasActiveJob = m.currentJob || m.assignedEmployees.length > 0;
            return (
              <tr key={m.id} className={`${hasActiveJob ? 'bg-white' : 'bg-slate-50 text-slate-400'} border border-slate-300`}>
                <td className="border border-slate-300 p-3 font-extrabold uppercase">
                  {m.name} <span className="text-[9px] text-slate-500 font-normal">({m.type})</span>
                </td>
                <td className="border border-slate-300 p-3 uppercase font-black text-[10px]">
                  {hasActiveJob ? (
                    <span className={m.status === MachineStatus.LAVORAZIONE ? 'text-emerald-700' : 'text-amber-600'}>
                      {m.status === MachineStatus.LAVORAZIONE ? 'LAVORO' : 'ATTREZZ.'}
                    </span>
                  ) : <span className="text-slate-400 font-medium">FERMA</span>}
                </td>
                <td className="border border-slate-300 p-3 font-mono">{m.currentJob || '—'}</td>
                <td className="border border-slate-300 p-3 font-mono">{m.processTime || '—'}</td>
                <td className="border border-slate-300 p-3 uppercase animate-none">
                  {m.assignedEmployees.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {m.assignedEmployees.map((e, i) => (
                        <span key={i} className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 border border-slate-200 font-bold">
                          {e}
                        </span>
                      ))}
                    </div>
                  ) : '—'}
                </td>
                <td className="border border-slate-300 p-3 italic text-slate-650">{m.notes || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Operatori non assegnati ma presenti nello Staff di oggi */}
      {(() => {
        const assignedNames = new Set(machines.flatMap(m => m.assignedEmployees));
        const freeEmployees = employees.filter(emp => !assignedNames.has(emp.name));
        if (freeEmployees.length > 0) {
          return (
            <div className="mt-6 border border-slate-300 rounded-xl p-4 bg-slate-50/50">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-2">Operatori Disponibili di Turno:</h3>
              <div className="flex flex-wrap gap-2">
                {freeEmployees.map((emp, i) => (
                  <span key={i} className="bg-white border text-xs font-bold px-2.5 py-1 rounded-lg uppercase shadow-sm">
                    👤 {emp.name}
                  </span>
                ))}
              </div>
            </div>
          );
        }
        return null;
      })()}

      <div className="mt-16 pt-8 border-t border-slate-200 flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
        <div>Generato in data {new Date().toLocaleDateString('it-IT')} • Planner Officina Automatizzato</div>
        <div>Firma per Ricevuta Capoturno: ___________________________</div>
      </div>
    </div>
  </>
);
};

export default App;
