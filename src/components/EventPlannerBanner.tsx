import { Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { navigate, paths } from "../router";

export const EVENT_PLACEHOLDER = "E.g., I'm hosting a potluck for 20 people...";

export default function EventPlannerBanner() {
  const [description, setDescription] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    navigate(paths.plan(description.trim()));
  };

  return (
    <section
      className="container planner-section"
      aria-labelledby="planner-banner-title"
    >
      <div className="planner-banner">
        <div className="planner-banner__text">
          <h2 id="planner-banner-title">Planning something?</h2>
          <p>
            Tell us what you're planning and we'll help you find everything you
            need.
          </p>
        </div>
        <form className="planner-banner__form" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="planner-banner-input">
            Describe your event
          </label>
          <input
            id="planner-banner-input"
            type="text"
            placeholder={EVENT_PLACEHOLDER}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button type="submit" className="btn btn--primary">
            <Sparkles size={18} aria-hidden="true" />
            Find items with AI
          </button>
        </form>
      </div>
    </section>
  );
}
