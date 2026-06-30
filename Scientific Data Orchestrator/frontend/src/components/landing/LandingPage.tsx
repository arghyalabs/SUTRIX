import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { SUTRIXLogo } from '../ui/SUTRIXLogo';

// 14 Interactive Landing Page Sections
import { HeroArea } from './HeroArea';
import { FeatureExplorer } from './FeatureExplorer';
import { StudioMap } from './StudioMap';
import { WorkflowSimulator } from './WorkflowSimulator';
import { CapabilityShowcase } from './CapabilityShowcase';
import { PipelineExplorer } from './PipelineExplorer';
import { ValidationSection } from './ValidationSection';
import { UseCases } from './UseCases';
import { DatasetJourney } from './DatasetJourney';
import { FeatureComparison } from './FeatureComparison';
import { DocCenter } from './DocCenter';
import { VideoHub } from './VideoHub';
import { StatsDashboard } from './StatsDashboard';
import { LaunchWorkspace } from './LaunchWorkspace';

interface LandingPageProps {
  onEnterHub: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnterHub }) => {
  return (
    <div className="min-h-screen bg-[#030712] text-white font-sans overflow-x-hidden selection:bg-cyan-500/20">
      
      {/* Sticky Top Header Navigation */}
      <header className="sticky top-0 left-0 w-full px-6 py-4 lg:px-12 z-40 flex items-center justify-between border-b border-white/[0.04] bg-[#030712]/85 backdrop-blur-xl">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={onEnterHub}>
          <SUTRIXLogo className="w-9 h-9" />
          <div className="flex flex-col leading-none">
            <span className="font-extrabold tracking-[0.15em] text-xl text-white group-hover:text-cyan-400 transition-colors">
              SUTRIX
            </span>
            <span className="text-[9px] font-bold tracking-[0.1em] text-white/40 uppercase mt-0.5">
              Scientific Data Orchestrator
            </span>
          </div>
        </div>

        {/* Scroll Quick links */}
        <nav className="hidden lg:flex items-center gap-6 text-[10px] font-bold uppercase tracking-widest text-white/40">
          <a href="#features" className="hover:text-cyan-400 transition-colors">Features</a>
          <a href="#simulator" className="hover:text-cyan-400 transition-colors">Simulator</a>
          <a href="#validation" className="hover:text-cyan-400 transition-colors">Credibility</a>
          <a href="#documentation" className="hover:text-cyan-400 transition-colors">Docs</a>
        </nav>

        {/* Hub Launcher Button */}
        <button
          onClick={onEnterHub}
          className="group flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs font-bold text-white transition-all hover:bg-white/[0.06] hover:border-cyan-500/30"
        >
          Open Tool Hub
          <ArrowRight className="w-3.5 h-3.5 text-white/50 group-hover:translate-x-0.5 group-hover:text-cyan-400 transition-all" />
        </button>
      </header>

      {/* Assemble the 14 Redesigned Sections */}
      
      {/* Section 1: Interactive Hero Area */}
      <div id="hero">
        <HeroArea />
      </div>

      {/* Section 2: What Can SUTRIX Do? */}
      <div id="features">
        <FeatureExplorer />
      </div>

      {/* Section 3: Studio Selection Map */}
      <div id="decision-tree">
        <StudioMap />
      </div>

      {/* Section 4: Interactive Workflow Simulator */}
      <div id="simulator">
        <WorkflowSimulator />
      </div>

      {/* Section 5: Scientific Capability Showcase */}
      <div id="capabilities">
        <CapabilityShowcase />
      </div>

      {/* Section 6: Interactive Pipeline Explorer */}
      <div id="pipelines">
        <PipelineExplorer />
      </div>

      {/* Section 7: Scientific Validation Section */}
      <div id="validation">
        <ValidationSection />
      </div>

      {/* Section 8: Use Cases */}
      <div id="use-cases">
        <UseCases />
      </div>

      {/* Section 9: Interactive Dataset Journey */}
      <div id="dataset-journey">
        <DatasetJourney />
      </div>

      {/* Section 10: Feature Comparison */}
      <div id="comparison">
        <FeatureComparison />
      </div>

      {/* Section 11: Documentation Center */}
      <div id="documentation">
        <DocCenter />
      </div>

      {/* Section 12: Video Tutorial Hub */}
      <div id="videos">
        <VideoHub />
      </div>

      {/* Section 13: Live Statistics Dashboard */}
      <div id="stats">
        <StatsDashboard />
      </div>

      {/* Section 14: Launch Workspace Section */}
      <div id="launch">
        <LaunchWorkspace />
      </div>

      {/* Premium Dark Footer */}
      <footer className="py-12 px-6 border-t border-white/[0.04] bg-[#02050b] text-center text-xs text-white/30 space-y-2">
        <div>SUTRIX V5 • Scientific Data Orchestration Platform</div>
        <div className="text-[10px] text-white/20">Built for predictive toxicology, QSAR modeling and regulatory analytics.</div>
      </footer>

    </div>
  );
};
export default LandingPage;
