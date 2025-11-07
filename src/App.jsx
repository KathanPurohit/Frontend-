// mindmaze-frontend/src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import LoginPage from './LoginPage';
import CategoryPage from './CategoryPage';

function App() {
  const [user, setUser] = useState(() => {
    const savedUser = sessionStorage.getItem('user');
    try {
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (e) {
      console.error("Failed to parse user from sessionStorage", e);
      sessionStorage.removeItem('user');
      return null;
    }
  });

  const [ws, setWs] = useState(null);
  const [currentView, setCurrentView] = useState('menu');
  const [gameState, setGameState] = useState({ players: [], question: '', questionIndex: 0, totalQuestions: 5, duration: 30, results: [], winner: null });
  const [lobbyState, setLobbyState] = useState({ playerCount: 0, maxPlayers: 8 });
  const [answer, setAnswer] = useState('');
  const [answerResult, setAnswerResult] = useState(null);
  const [timer, setTimer] = useState(30);
  const timerRef = useRef(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState({});
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [isLoading, setIsLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);

  // ✅ Backend URLs (supports local + production)
  const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const WS_BASE_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000";

  useEffect(() => {
    if (currentView === 'playing') {
      timerRef.current = setInterval(() => {
        setTimer(t => (t > 0 ? t - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [currentView, gameState.questionIndex]);

  useEffect(() => {
    if (timer === 0 && currentView === 'playing' && !answerResult) {
      if (ws) {
        ws.send(JSON.stringify({ type: 'submit_answer', answer: '' }));
      }
    }
  }, [timer, currentView, answerResult, ws]);

  useEffect(() => {
    if (user && user.username) {
      sessionStorage.setItem('user', JSON.stringify(user));
      const websocket = new WebSocket(`${WS_BASE_URL}/ws/${user.username}`);
      
      websocket.onopen = () => setConnectionStatus('Connected');
      websocket.onclose = () => setConnectionStatus('Disconnected');
      websocket.onerror = () => setConnectionStatus('Error');
      websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'stats_update') {
          setStats(data.stats); return;
        }
        switch (data.type) {
          case 'waiting_update':
            setCurrentView('waiting');
            setLobbyState({ playerCount: data.player_count, maxPlayers: data.max_players });
            break;
          case 'new_question':
            setCurrentView('playing');
            setGameState(gs => ({ ...gs, question: data.question, questionIndex: data.question_index, totalQuestions: data.total_questions, duration: data.duration }));
            setTimer(data.duration);
            setAnswer('');
            setAnswerResult(null);
            break;
          case 'answer_result':
            setAnswerResult(data);
            setTimeout(() => setAnswerResult(null), 1500);
            break;
          case 'player_finished':
            setCurrentView('waiting');
            setMessage(data.message);
            break;
          case 'game_end':
            setMessage('');
            setCurrentView('finished');
            setGameState(gs => ({ ...gs, results: data.results, winner: data.winner }));
            const myResult = data.results.find(r => r.username === user.username);
            if (myResult && myResult.new_total_score !== undefined) {
              setUser(prevUser => ({ ...prevUser, score: myResult.new_total_score }));
            }
            loadLeaderboard();
            break;
          case 'match_failed':
            setCurrentView('categories');
            setMessage(data.message);
            setTimeout(() => setMessage(''), 3000);
            break;
        }
      };
      setWs(websocket);
      return () => { websocket.close(); };
    } else {
      sessionStorage.removeItem('user');
    }
  }, [user?.username]);

  useEffect(() => { loadLeaderboard(); loadStats(); }, []);

  const handleLogin = async (credentials) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });
      if (response.ok) { const data = await response.json(); setUser(data.user); } 
      else { const err = await response.json(); setMessage(err.detail || 'Login failed'); }
    } catch {
      setMessage('Connection error');
    } finally { setIsLoading(false); }
  };

  const handleSignup = async (userData) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });
      if (response.ok) { const data = await response.json(); setUser(data.user); }
      else { const err = await response.json(); setMessage(err.detail || 'Signup failed'); }
    } catch {
      setMessage('Connection error');
    } finally { setIsLoading(false); }
  };

  const findMatch = () => setCurrentView('categories');
  const handleCategorySelect = (category) => { setSelectedCategory(category); if (ws) ws.send(JSON.stringify({ type: 'find_match', category: category.id })); };
  const handleBackToHome = () => { setCurrentView('menu'); setMessage(''); };
  const submitAnswer = (e) => { e.preventDefault(); if (ws && answer.trim()) { ws.send(JSON.stringify({ type: 'submit_answer', answer: answer.trim() })); setAnswer(''); } };
  const cancelSearch = () => { if (ws) ws.send(JSON.stringify({ type: 'cancel_search' })); setCurrentView('categories'); setMessage(''); };
  const loadLeaderboard = async () => { try { const response = await fetch(`${API_BASE_URL}/api/leaderboard`); if (response.ok) setLeaderboard(await response.json()); } catch {} };
  const loadStats = async () => { try { const response = await fetch(`${API_BASE_URL}/api/stats`); if (response.ok) setStats(await response.json()); } catch {} };
  const logout = () => { setUser(null); };

  if (!user) return (<LoginPage isLogin={isLogin} setIsLogin={setIsLogin} onLogin={handleLogin} onSignup={handleSignup} message={message} isLoading={isLoading} />);
  if (currentView === 'categories') return (<CategoryPage onSelectCategory={handleCategorySelect} onBackToHome={handleBackToHome} user={user} />);

  return (
    <div className="app">
      <div className="container">
        <div className="app-header"><h1>🧠 MindMaze</h1><button className="logout-btn" onClick={logout}>Logout</button></div>
        {/* UI CONTINUES UNCHANGED */}
      </div>
    </div>
  );
}

export default App;
